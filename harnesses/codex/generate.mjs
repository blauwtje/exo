// Generates the Codex skill and agent tree from the Claude sources, in memory,
// as one map of path (relative to the exo root) to text:
//
//   harnesses/codex/generated/skills/<name>/**/*.md      each skill Markdown file, rewritten by rules.mjs
//   harnesses/codex/generated/skills/<name>/agents/openai.yaml   the policy of an explicit-only skill
//   harnesses/codex/generated/agents/exo-<agent>.toml    one custom agent per `agents/*.md` entry and low twin
//
// An override in `harnesses/codex/overrides/<path under generated>` replaces one
// generated file when its first line, `<!-- exo:override source-sha256=<hash> -->`,
// names the sha256 of that file's Claude source; the line itself is dropped
// from the output. A changed source hash is drift, never a silent fallback.
//
//   node harnesses/codex/generate.mjs           write the tree
//   node harnesses/codex/generate.mjs --check   list drift and exit 1 when any
//
// The agent sandbox approximates the tool allowlist: `read-only` for the agents in
// READ_ONLY, whose tools hold no Edit or Write, `workspace-write` for the rest
// (run-unit has neither tool but lands commits through Bash, so it writes).
// `maxTurns` and `omitClaudeMd` have no Codex field and are dropped.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { INHERIT, readKindTable } from '../../lib/model-kinds.mjs';
import { codexBody, codexMarkdown, codexOpenaiYaml, splitFrontmatter } from './rules.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const GENERATED = path.posix.join('harnesses', 'codex', 'generated');
const OVERRIDES = path.posix.join('harnesses', 'codex', 'overrides');
const READ_ONLY = ['agents/fetch-docs.md', 'agents/locate-code.md'];
const OVERRIDE_HEADER = /^<!-- exo:override source-sha256=([0-9a-f]{64}) -->\n/;

const hashOf = (text) => crypto.createHash('sha256').update(text).digest('hex');
const posix = (file) => file.split(path.sep).join('/');

// A JSON string is a valid TOML basic string.
function tomlString(text) {
  return JSON.stringify(text);
}

// The multi-line literal string takes the text verbatim, so no escape can
// alter an instruction; its one limit is a body holding three single quotes.
function tomlLiteralBlock(text) {
  if (text.includes("'''")) {
    throw new Error("an agent body holds ''', which a TOML literal string cannot carry; reword it");
  }
  return `'''\n${text}'''`;
}

function renderAgent({ name, description, instructions, model, effort, sandbox }) {
  const lines = [
    `name = ${tomlString(name)}`,
    `description = ${tomlString(description)}`
  ];
  if (model !== INHERIT) lines.push(`model = ${tomlString(model)}`);
  if (effort !== null) lines.push(`model_reasoning_effort = ${tomlString(effort)}`);
  lines.push(`sandbox_mode = ${tomlString(sandbox)}`);
  lines.push(`developer_instructions = ${tomlLiteralBlock(instructions)}`);
  return `${lines.join('\n')}\n`;
}

function listFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  const found = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const location = path.join(directory, entry.name);
    if (entry.isDirectory()) found.push(...listFiles(location));
    else found.push(location);
  }
  return found.sort();
}

function readKnown(root) {
  const skillsRoot = path.join(root, 'skills');
  const skills = fs.readdirSync(skillsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(skillsRoot, entry.name, 'SKILL.md')))
    .map((entry) => entry.name)
    .sort();
  const agents = fs.readdirSync(path.join(root, 'agents'))
    .filter((name) => name.endsWith('.md'))
    .map((name) => path.basename(name, '.md'))
    .sort();
  return { skills, agents };
}

// Adds each skill's rewritten Markdown, its other non-script files verbatim and its policy file; `sources` maps each
// generated path to the Claude file whose hash an override must name.
function addSkills(root, known, files, sources) {
  for (const name of known.skills) {
    const directory = path.join(root, 'skills', name);
    for (const location of listFiles(directory)) {
      // Scripts stay in the clone, which the installed text reaches through {{EXO_ROOT}}.
      if (location.endsWith('.mjs')) continue;
      const source = posix(path.relative(root, location));
      const generated = path.posix.join(GENERATED, source);
      const text = fs.readFileSync(location, 'utf8');
      files.set(generated, location.endsWith('.md') ? codexMarkdown(source, text, known) : text);
      sources.set(generated, source);
    }
    const skillSource = `skills/${name}/SKILL.md`;
    const policy = codexOpenaiYaml(skillSource, fs.readFileSync(path.join(root, skillSource), 'utf8'));
    if (policy === null) continue;
    const generated = path.posix.join(GENERATED, 'skills', name, 'agents', 'openai.yaml');
    files.set(generated, policy);
    sources.set(generated, skillSource);
  }
}

function addAgents(root, known, files, sources) {
  const table = readKindTable(path.join(root, 'lib', 'model-kinds.json'), { provider: 'codex' });
  const preamble = fs.readFileSync(path.join(root, 'harnesses', 'codex', 'agent-preamble.md'), 'utf8');

  function add(name, file, entry, resolved, description) {
    const text = fs.readFileSync(path.join(root, entry.generatedFrom ?? file), 'utf8');
    const { body } = splitFrontmatter(text);
    const own = splitFrontmatter(fs.readFileSync(path.join(root, file), 'utf8')).fields;
    const generated = path.posix.join(GENERATED, 'agents', `${name}.toml`);
    files.set(generated, renderAgent({
      name,
      description: codexBody(file, description ?? entry.description ?? own.description, known),
      instructions: `${preamble.trimEnd()}\n\n${codexBody(file, body.replace(/^\n+/, ''), known)}`,
      model: resolved.model,
      effort: resolved.effort,
      sandbox: READ_ONLY.includes(file) ? 'read-only' : 'workspace-write'
    }));
    sources.set(generated, entry.generatedFrom ?? file);
  }

  for (const [file, entry] of Object.entries(table.agents)) {
    add(`exo-${path.basename(file, '.md')}`, file, entry, table.kinds[entry.kind]);
  }
  for (const [file, twin] of Object.entries(table.lowTwins)) {
    const source = path.basename(file, '.md');
    const description = `${source} at ${twin.model} and ${twin.effort} effort for the low budget, dispatched by name only.`;
    add(twin.name, file, table.agents[file], twin, description);
  }
}

// Replaces each generated file that has a matching override; returns the
// problems of the overrides that cannot apply.
function applyOverrides(root, files, sources) {
  const problems = [];
  const directory = path.join(root, OVERRIDES);
  for (const location of listFiles(directory)) {
    const relative = posix(path.relative(directory, location));
    if (relative === 'README.md') continue;
    const file = path.posix.join(OVERRIDES, relative);
    const generated = path.posix.join(GENERATED, relative);
    const text = fs.readFileSync(location, 'utf8');
    const header = OVERRIDE_HEADER.exec(text);
    if (!files.has(generated)) {
      problems.push({ file, problem: 'overrides a file the rules do not generate' });
    } else if (header === null) {
      problems.push({ file, problem: 'does not open with <!-- exo:override source-sha256=<hash> -->' });
    } else if (header[1] !== hashOf(fs.readFileSync(path.join(root, sources.get(generated)), 'utf8'))) {
      problems.push({ file, problem: `source hash changed: ${sources.get(generated)} differs from the one it overrides` });
    } else {
      files.set(generated, text.slice(header[0].length));
    }
  }
  return problems;
}

function build(root) {
  const known = readKnown(root);
  const files = new Map();
  const sources = new Map();
  addSkills(root, known, files, sources);
  addAgents(root, known, files, sources);
  const problems = applyOverrides(root, files, sources);
  return { files, problems };
}

function buildOrThrow(root) {
  const built = build(root);
  if (built.problems.length > 0) {
    throw new Error(built.problems.map((record) => `${record.file}: ${record.problem}`).join('\n'));
  }
  return built.files;
}

// Returns a Map of path relative to `root` to the file's expected text; a stale or
// malformed override throws instead of falling back to the plain rule output.
export function generateTree(root = ROOT) {
  return buildOrThrow(root);
}

// Lists drift as { file, problem } records, empty when every generated file
// matches, no file stands in `generated/` without a source and every override applies.
export function findGeneratedDrift(root = ROOT) {
  const { files, problems } = build(root);
  const drift = [...problems];
  for (const [file, text] of files) {
    const location = path.join(root, file);
    if (!fs.existsSync(location)) drift.push({ file, problem: 'missing' });
    else if (fs.readFileSync(location, 'utf8') !== text) drift.push({ file, problem: 'differs from the sources' });
  }
  for (const location of listFiles(path.join(root, GENERATED))) {
    const file = posix(path.relative(root, location));
    if (!files.has(file)) drift.push({ file, problem: 'not generated from the sources' });
  }
  return drift;
}

// A stray file stays: `--check` names it, and the user decides whether to delete it.
export function writeGenerated(root = ROOT) {
  for (const [file, text] of buildOrThrow(root)) {
    const location = path.join(root, file);
    fs.mkdirSync(path.dirname(location), { recursive: true });
    fs.writeFileSync(location, text);
  }
}

function main() {
  const { values } = parseArgs({ options: { check: { type: 'boolean', default: false } } });
  if (!values.check) {
    writeGenerated();
    return;
  }
  const drift = findGeneratedDrift();
  for (const record of drift) console.log(`${record.file}: ${record.problem}`);
  if (drift.length > 0) process.exitCode = 1;
}

if (fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) main();

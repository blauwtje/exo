
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { INHERIT, readKindTable } from '../../lib/model-kinds.mjs';
import { preambleWithBrief } from './brief.mjs';
import { hashOf } from '../install-files.mjs';
import { codexBody, codexMarkdown, codexOpenaiYaml, splitFrontmatter } from './rules.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const GENERATED = path.posix.join('harnesses', 'codex', 'generated');
const OVERRIDES = path.posix.join('harnesses', 'codex', 'overrides');
const IGNORED_FILES = ['.DS_Store', '.exo'];
const OVERRIDE_HEADER = /^<!-- exo:override source-sha256=([0-9a-f]{64}) -->\n/;

export const posix = (file) => file.split(path.sep).join('/');

function tomlString(text) {
  return JSON.stringify(text);
}

function tomlLiteralBlock(text) {
  if (text.includes("'''")) {
    throw new Error("an agent body holds ''', which a TOML literal string cannot carry; reword it");
  }
  return `'''\n${text}'''`;
}

function renderAgent({ name, description, instructions, model, effort }) {
  const lines = [
    `name = ${tomlString(name)}`,
    `description = ${tomlString(description)}`
  ];
  if (model !== INHERIT) lines.push(`model = ${tomlString(model)}`);
  if (effort !== null) lines.push(`model_reasoning_effort = ${tomlString(effort)}`);
  lines.push(`developer_instructions = ${tomlLiteralBlock(instructions)}`);
  return `${lines.join('\n')}\n`;
}

export function listFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  const found = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (IGNORED_FILES.includes(entry.name)) continue;
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

function skillSourceFile(root, known, location) {
  const source = posix(path.relative(root, location));
  const text = fs.readFileSync(location, 'utf8');
  return { generated: path.posix.join(GENERATED, source), source, text: location.endsWith('.md') ? codexMarkdown(source, text, known) : text };
}

function skillPolicy(root, name) {
  const source = `skills/${name}/SKILL.md`;
  const text = codexOpenaiYaml(source, fs.readFileSync(path.join(root, source), 'utf8'));
  if (text === null) return [];
  return [{ generated: path.posix.join(GENERATED, 'skills', name, 'agents', 'openai.yaml'), source, text }];
}

function skillGenerated(root, known, name) {
  const locations = listFiles(path.join(root, 'skills', name)).filter((location) => !location.endsWith('.mjs'));
  return [...locations.map((location) => skillSourceFile(root, known, location)), ...skillPolicy(root, name)];
}

function agentGenerated({ root, known, table }, [file, entry]) {
  const name = `exo-${path.basename(file, '.md')}`;
  const resolved = table.kinds[entry.kind];
  const { body } = splitFrontmatter(fs.readFileSync(path.join(root, entry.generatedFrom ?? file), 'utf8'));
  const own = splitFrontmatter(fs.readFileSync(path.join(root, file), 'utf8')).fields;
  const text = renderAgent({
    name,
    description: codexBody(file, entry.description ?? own.description, known),
    instructions: `${preambleWithBrief(root, own)}${codexBody(file, body.replace(/^\n+/, ''), known)}`,
    model: resolved.model,
    effort: resolved.effort
  });
  return { generated: path.posix.join(GENERATED, 'agents', `${name}.toml`), source: entry.generatedFrom ?? file, text };
}

function overrideProblem({ root, files, sources }, { generated, text, header }) {
  if (!files.has(generated)) return 'overrides a file the rules do not generate';
  if (header === null) return 'does not open with <!-- exo:override source-sha256=<hash> -->';
  const source = sources.get(generated);
  if (header[1] === hashOf(fs.readFileSync(path.join(root, source), 'utf8'))) return undefined;
  return `source hash changed: ${source} differs from the one it overrides`;
}

function applyOverrides(root, files, sources) {
  const problems = [];
  const directory = path.join(root, OVERRIDES);
  for (const location of listFiles(directory)) {
    const relative = posix(path.relative(directory, location));
    if (relative === 'README.md') continue;
    const generated = path.posix.join(GENERATED, relative);
    const text = fs.readFileSync(location, 'utf8');
    const header = OVERRIDE_HEADER.exec(text);
    const problem = overrideProblem({ root, files, sources }, { generated, text, header });
    if (problem !== undefined) problems.push({ file: path.posix.join(OVERRIDES, relative), problem });
    else files.set(generated, text.slice(header[0].length));
  }
  return problems;
}

function build(root) {
  const known = readKnown(root);
  const table = readKindTable(path.join(root, 'lib', 'model-kinds.json'), { provider: 'codex' });
  const generated = [
    ...known.skills.flatMap((name) => skillGenerated(root, known, name)),
    ...Object.entries(table.agents).map((agent) => agentGenerated({ root, known, table }, agent))
  ];
  const files = new Map(generated.map((entry) => [entry.generated, entry.text]));
  const sources = new Map(generated.map((entry) => [entry.generated, entry.source]));
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

export function generateTree(root = ROOT) {
  return buildOrThrow(root);
}

export function findOverrideProblems(root = ROOT) {
  return build(root).problems;
}

function writeGenerated(root = ROOT) {
  const files = buildOrThrow(root);
  fs.rmSync(path.join(root, GENERATED), { recursive: true, force: true });
  for (const [file, text] of files) {
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
  const problems = findOverrideProblems();
  for (const record of problems) console.log(`${record.file}: ${record.problem}`);
  if (problems.length > 0) process.exitCode = 1;
}

if (fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) main();

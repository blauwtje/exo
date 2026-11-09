import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { INHERIT, readKindTable } from '../../lib/model-kinds.mjs';
import { splitFrontmatter } from '../codex/rules.mjs';
import { preambleWithBrief } from '../codex/brief.mjs';
import { listFiles, posix } from '../codex/generate.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));

export function readOpenCodeConfig(home = os.homedir()) {
  const file = path.join(home, '.config', 'exo', 'run.json');
  if (!fs.existsSync(file)) return {};
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function withRoots(text, exoRoot, skillDir) {
  const rooted = text.replaceAll('${CLAUDE_PLUGIN_ROOT}', exoRoot);
  return rooted.replaceAll('${CLAUDE_SKILL_DIR}', skillDir);
}

function modelLine(config, effort) {
  const model = config.opencode?.model;
  if (!model) return [];
  const variant = effort === null ? undefined : config.opencode.variants?.[effort];
  return [`model: ${variant ? `${model}#${variant}` : model}`];
}

function addSkills(root, exoRoot, files) {
  const skillsRoot = path.join(root, 'skills');
  for (const entry of fs.readdirSync(skillsRoot, { withFileTypes: true })) {
    const directory = path.join(skillsRoot, entry.name);
    if (!entry.isDirectory() || !fs.existsSync(path.join(directory, 'SKILL.md'))) continue;
    const skillDir = `${exoRoot}/skills/${entry.name}`;
    for (const location of listFiles(directory)) {
      if (location.endsWith('.mjs')) continue;
      const text = fs.readFileSync(location, 'utf8');
      const rewritten = location.endsWith('.md') ? withRoots(text, exoRoot, skillDir) : text;
      files.set(posix(path.relative(root, location)), rewritten);
    }
  }
}

function addAgents(root, exoRoot, config, files) {
  const table = readKindTable(path.join(root, 'lib', 'model-kinds.json'), { provider: 'claude' });
  for (const [file, entry] of Object.entries(table.agents)) {
    const source = fs.readFileSync(path.join(root, entry.generatedFrom ?? file), 'utf8');
    const own = splitFrontmatter(fs.readFileSync(path.join(root, file), 'utf8')).fields;
    const { body } = splitFrontmatter(source);
    const { effort } = table.kinds[entry.kind];
    const header = [
      'mode: subagent',
      `description: ${JSON.stringify(entry.description ?? own.description)}`,
      ...modelLine(config, effort === INHERIT ? null : effort)
    ];
    const text = `---\n${header.join('\n')}\n---\n${preambleWithBrief(root, own, 'opencode')}${withRoots(body.replace(/^\n+/, ''), exoRoot, '(the skill folder path the dispatch passes)')}`;
    files.set(`agents/exo-${path.basename(file)}`, text);
  }
}

export function generateOpenCodeTree(root = ROOT, { exoRoot = root, config = readOpenCodeConfig() } = {}) {
  const files = new Map();
  addSkills(root, exoRoot, files);
  addAgents(root, exoRoot, config, files);
  return files;
}

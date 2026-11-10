import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { escapeRegExp } from '#basics';
import { listFiles, loadFoldMap } from './checks/folded-names.mjs';

const MAP_FILE = 'verify/fold-map.json';
const ROWS_FILE = 'verify/reference-owner-rows.txt';
const PLUGIN_ROOT = '${CLAUDE_PLUGIN_ROOT}';
const SKILL_DIR = '${CLAUDE_SKILL_DIR}';

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

function move(from, to) {
  if (fs.existsSync(to)) throw new Error(`${to} already exists`);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.renameSync(from, to);
}

function stripFrontmatter(text) {
  return text.replace(/^---\n[\s\S]*?\n---\n+/, '');
}

function findBody(job) {
  const candidates = [`skills/${job.owner}/${job.name}/MODE.md`, `skills/${job.name}/SKILL.md`];
  return candidates.find((candidate) => fs.existsSync(path.join(job.root, candidate)));
}

function moveBody(job) {
  const source = findBody(job);
  if (source === undefined) throw new Error(`no MODE.md or SKILL.md body found for ${job.name}`);
  const target = path.join(job.root, `skills/${job.owner}/references/${job.name}.md`);
  if (fs.existsSync(target)) throw new Error(`${target} already exists`);
  const text = stripFrontmatter(fs.readFileSync(path.join(job.root, source), 'utf8'));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, text);
  fs.rmSync(path.join(job.root, source));
  fs.rmSync(path.join(job.root, `skills/${job.owner}/${job.name}`), { recursive: true, force: true });
  return `references/${job.name}.md`;
}

function moveFolder(job) {
  const folder = path.join(job.root, 'skills', job.name);
  const moved = [];
  for (const file of walk(folder)) {
    const relative = path.relative(folder, file);
    if (relative === 'SKILL.md') continue;
    if (!/^(scripts|references|assets)\//.test(relative)) throw new Error(`skills/${job.name}/${relative} is neither a script nor a reference`);
    move(file, path.join(job.root, 'skills', job.owner, relative));
    if (relative.startsWith('references/')) moved.push(relative);
  }
  fs.rmSync(folder, { recursive: true, force: true });
  return moved;
}

function scope(job, file) {
  const base = `skills/${job.owner}/`;
  if (file.startsWith(`${base}references/`)) return { up: '../', sibling: '', same: '' };
  if (file.startsWith(base)) return { up: '', sibling: 'references/', same: '' };
  return { up: `../${job.owner}/`, sibling: `../${job.owner}/references/`, same: `../${job.owner}/` };
}

function replacements(job, file) {
  const { name, owner } = job;
  const pair = (pattern, text) => [new RegExp(pattern, 'g'), text];
  const n = escapeRegExp(name);
  const names = [pair(`exo:${n}(?![\\w-])`, `exo:${owner}`)];
  if (job.kind === 'agents') return [...names, pair(`agents/${n}\\.md`, `agents/${owner}.md`)];
  const here = scope(job, file);
  return [
    pair(`${escapeRegExp(SKILL_DIR)}/\\.\\./${n}/`, `${PLUGIN_ROOT}/skills/${owner}/`),
    pair(`skills/${escapeRegExp(owner)}/${n}/MODE\\.md`, `skills/${owner}/references/${name}.md`),
    pair(`\\.\\./${n}/MODE\\.md`, `${here.sibling}${name}.md`),
    pair(`skills/${n}/`, `skills/${owner}/`),
    pair(`\\.\\./${n}/references/`, here.sibling),
    pair(`\\.\\./${n}/`, here.up),
    ...names,
  ];
}

function rewriteAll(job) {
    let changed = 0;
  for (const file of listFiles(job.root)) {
    const before = fs.readFileSync(path.join(job.root, file), 'utf8');
    const rules = replacements(job, file);
    const replaced = rules.reduce((text, [pattern, to]) => text.replace(pattern, to), before);
    if (replaced === before) continue;
    fs.writeFileSync(path.join(job.root, file), replaced);
    changed += 1;
  }
  return changed;
}

function insertRows(job, rows) {
  const skillFile = path.join(job.root, `skills/${job.owner}/SKILL.md`);
  const lines = fs.readFileSync(skillFile, 'utf8').split('\n');
  const header = lines.findIndex((line) => line === '| File | Read it when |');
  if (header < 0) throw new Error(`skills/${job.owner}/SKILL.md has no References table`);
  let end = header + 2;
  while (end < lines.length && lines[end].startsWith('|')) end += 1;
  lines.splice(end, 0, ...rows.map(([file, when]) => `| \`${file}\` | ${when} |`));
  fs.writeFileSync(skillFile, lines.join('\n'));
}

function appendOwnerRows(job, rows) {
  const text = rows.map(([file]) => `skills/${job.owner}/SKILL.md ${file}`).join('\n');
  const rowsFile = path.join(job.root, ROWS_FILE);
  const existing = fs.readFileSync(rowsFile, 'utf8');
  const gap = existing === '' || existing.endsWith('\n') ? '' : '\n';
  fs.writeFileSync(rowsFile, `${existing}${gap}${text}\n`);
}

function appendRows(job, body, extras) {
  const rows = [[body, `Request runs mode \`${job.name}\`.`], ...extras.map((file) => [file, `Mode \`${job.name}\` names it.`])];
  insertRows(job, rows);
  appendOwnerRows(job, rows);
}

function flip(job, map) {
  map[job.kind][job.name].state = 'folded';
  fs.writeFileSync(path.join(job.root, MAP_FILE), `${JSON.stringify(map, null, 2)}\n`);
}

function unmatched(job) {
  const pattern = new RegExp(`\`${escapeRegExp(job.name)}\``);
  return listFiles(job.root).flatMap((file) => {
    const lines = fs.readFileSync(path.join(job.root, file), 'utf8').split('\n');
    return lines.flatMap((line, index) => (pattern.test(line) ? [`${file}:${index + 1}: ${line.trim()}`] : []));
  });
}

function foldSkill(job) {
  fs.rmSync(path.join(job.root, `docs/skills/${job.name}.md`), { force: true });
  const body = moveBody(job);
  const extras = moveFolder(job);
  appendRows(job, body, extras);
}

function main() {
  const options = { root: { type: 'string', default: process.cwd() }, from: { type: 'string' }, into: { type: 'string' } };
  const { root, from: name, into: owner } = parseArgs({ options }).values;
  if (name === undefined || owner === undefined) throw new Error('usage: node verify/fold-skills.mjs --from <name> --into <owner>');
  const map = loadFoldMap(root);
  const kind = map.skills[name] === undefined ? 'agents' : 'skills';
  const entry = map[kind][name];
  if (entry === undefined || entry.owner !== owner) throw new Error(`${MAP_FILE} does not map ${name} into ${owner}`);
  const job = { root, name, owner, kind };
  if (kind === 'skills' && entry.state === 'pending') foldSkill(job);
  const files = rewriteAll(job);
  if (entry.state === 'pending') flip(job, map);
  console.log(`${name} -> ${owner}: ${files} files rewritten`);
  for (const line of unmatched(job)) console.log(`unmatched ${line}`);
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { git } from '#git';

const NAME = 'folded names';
const MAP_FILE = 'verify/fold-map.json';
const EXCLUDED = [
  /^CHANGELOG/,
  /^benchmarks\//,
  /^docs\/benchmarks\//,
  /^docs\/specs\//,
  /^node_modules\//,
  /^verify\/fold-map\.json$/,
  /^verify\/fold-skills\.mjs$/,
  /^verify\/checks\/folded-names\.mjs$/,
  /^tests\/folded-names\.test\.mjs$/,
];

export function isExcluded(file) {
  return EXCLUDED.some((pattern) => pattern.test(file));
}

export function loadFoldMap(root) {
  return JSON.parse(fs.readFileSync(path.join(root, MAP_FILE), 'utf8'));
}

export function foldedEntries(map) {
  const named = (kind) => Object.entries(map[kind] ?? {}).filter(([, entry]) => entry.state !== 'pending');
  return { skills: named('skills').map(([name]) => name), agents: named('agents').map(([name]) => name) };
}

export function listFiles(root) {
  const run = git(root, ['ls-files', '-z', '--cached', '--others', '--exclude-standard']);
  const files = run.stdout.split('\0').filter((file) => file !== '' && !isExcluded(file));
  return files.filter((file) => fs.existsSync(path.join(root, file)));
}

function escaped(name) {
  return name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function oldNamePattern({ skills, agents }) {
  const parts = ['MODE\\.md'];
  for (const name of [...skills, ...agents]) parts.push(`exo:${escaped(name)}(?![\\w-])`);
  for (const name of skills) parts.push(`skills/${escaped(name)}/`);
  for (const name of agents) parts.push(`agents/${escaped(name)}\\.md`);
  return new RegExp(parts.join('|'));
}

function fileHits(root, file, pattern) {
  const lines = fs.readFileSync(path.join(root, file), 'utf8').split('\n');
  return lines.flatMap((line, index) => (pattern.test(line) ? [`${file}:${index + 1}: ${line.trim()}`] : []));
}

export function foldedNameHits(root) {
  const pattern = oldNamePattern(foldedEntries(loadFoldMap(root)));
  return listFiles(root).flatMap((file) => fileHits(root, file, pattern));
}

export function checkFoldedNames(report, repository) {
  if (!fs.existsSync(path.join(repository.root, MAP_FILE))) {
    report.result('UNRUN', NAME, `${MAP_FILE} is missing`);
    return;
  }
  const hits = foldedNameHits(repository.root);
  report.assert(
    hits.length === 0,
    NAME,
    'no file names a folded skill or agent, a folded skill path or a MODE.md',
    `run node verify/fold-skills.mjs --from <name> --into <owner>; found: ${hits.slice(0, 5).join(' | ')}${hits.length > 5 ? ` (+${hits.length - 5} more)` : ''}`
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const hits = foldedNameHits(process.cwd());
  for (const hit of hits) console.log(hit);
  process.exit(hits.length === 0 ? 0 : 1);
}

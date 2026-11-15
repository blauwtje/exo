import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const SOURCE = /\.(?:[cm]?[jt]sx?|py|rs|go)$/;
const EXPORT = /^export\s+(?:default\s+)?(?:async\s+)?(?:function\*?|class|const|let|var|interface|type|enum)\s+([A-Za-z_$][\w$]*)/gm;
const MAX_BYTES = 1024 * 1024;

function git(args) {
  return spawnSync('git', args, { encoding: 'utf8' });
}

function exportsOf(file) {
  if (!SOURCE.test(file)) return [];
  const stats = fs.statSync(file, { throwIfNoEntry: false });
  if (!stats?.isFile() || stats.size > MAX_BYTES) return [];
  return [...fs.readFileSync(file, 'utf8').matchAll(EXPORT)].map((match) => match[1]);
}

function main() {
  const top = git(['rev-parse', '--show-toplevel']);
  if (top.status !== 0) return console.log('no map: this directory is not inside a git repository');
  const root = top.stdout.trim();
  const listing = git(['-C', root, 'ls-files']).stdout.split('\n').filter(Boolean);
  const lines = listing.map((file) => {
    const names = exportsOf(path.join(root, file));
    return names.length === 0 ? file : `${file}: ${names.join(', ')}`;
  });
  const file = path.join(root, '.exo', 'map.md');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `# Repository map\n${lines.join('\n')}\n`);
  console.log(file);
  console.log(`grep -n '<term>' ${file}   # search the map, never read it whole`);
}

main();

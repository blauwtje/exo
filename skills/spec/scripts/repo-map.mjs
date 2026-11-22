import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { scratchPath } from '#scratch-path';

const SOURCE = /\.(?:[cm]?[jt]sx?|py|rs|go)$/;
const EXPORT = /^export\s+(?:default\s+)?(?:async\s+)?(?:function\*?|class|const|let|var|interface|type|enum)\s+([A-Za-z_$][\w$]*)/gm;
const MAX_BYTES = 1024 * 1024;
const HUB_USERS = 3;
const LEGEND = 'name•N: N other files use this export';

function git(args) {
  return spawnSync('git', args, { encoding: 'utf8' });
}

function textOf(file) {
  const stats = fs.statSync(file, { throwIfNoEntry: false });
  if (!stats?.isFile() || stats.size > MAX_BYTES) return '';
  return fs.readFileSync(file, 'utf8');
}

function exportsOf(file, text) {
  if (!SOURCE.test(file)) return [];
  return [...text.matchAll(EXPORT)].map((match) => match[1]);
}

function wholeWord(name) {
  const escaped = name.replace(/[$]/g, '\\$&');
  return new RegExp(`(?<![\\w$])${escaped}(?![\\w$])`);
}

function userCount(name, file, texts) {
  const word = wholeWord(name);
  let count = 0;
  for (const [other, text] of texts) if (other !== file && word.test(text)) count += 1;
  return count;
}

function main() {
  const top = git(['rev-parse', '--show-toplevel']);
  if (top.status !== 0) return console.log('no map: this directory is not inside a git repository');
  const root = top.stdout.trim();
  const listing = git(['-C', root, 'ls-files']).stdout.split('\n').filter(Boolean);
  const texts = new Map(listing.map((file) => [file, textOf(path.join(root, file))]));
  const lines = listing.map((file) => {
    const names = exportsOf(file, texts.get(file)).map((name) => {
      const users = userCount(name, file, texts);
      return users >= HUB_USERS ? `${name}•${users}` : name;
    });
    return names.length === 0 ? file : `${file}: ${names.join(', ')}`;
  });
  const file = scratchPath(root, 'map.md');
  fs.writeFileSync(file, `# Repository map\n${LEGEND}\n${lines.join('\n')}\n`);
  console.log(file);
  console.log(`grep -n '<term>' ${file}   # search the map, never read it whole`);
}

main();

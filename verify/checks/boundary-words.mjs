// A boundary word in instruction prose (`only`, `never`, `unless`...) narrows what a rule
// allows, and a rewrite can lose one without a test noticing. This check counts each word per
// edited prose file against the base and fails when a count falls, unless a `Drops:` line names
// the drop: `Drops: <word> in <path>[, <word> in <path>]`, in a commit body since origin/main
// or in the EXO_DROPS environment variable.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const BASE_REF = 'origin/main';
const FOLDERS = ['skills', 'agents', 'rules', 'hooks'];
const WORDS = ['only', 'not', 'no', 'never', 'every', 'each', 'all', 'full', 'except', 'unless'];
const NAME = 'boundary words';

function git(root, args) {
  return spawnSync('git', ['-C', root, ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

export function countWords(text) {
  const counts = Object.fromEntries(WORDS.map((word) => [word, 0]));
  for (const match of text.toLowerCase().matchAll(/[a-z]+/g)) {
    if (match[0] in counts) counts[match[0]] += 1;
  }
  return counts;
}

// `<word> in <path>[, <word> in <path>]` entries as "word in path" strings.
export function parseDrops(value) {
  return value.split(',').map((entry) => entry.trim().replace(/\s+/g, ' ')).filter((entry) => / in /.test(entry));
}

function allowances(root, env) {
  const allowed = new Set(parseDrops(env.EXO_DROPS ?? ''));
  const log = git(root, ['log', `${BASE_REF}..HEAD`, '--format=%B']);
  if (log.status === 0) {
    for (const match of log.stdout.matchAll(/^Drops: (.+)$/gm)) parseDrops(match[1]).forEach((entry) => allowed.add(entry));
  }
  return allowed;
}

function isProse(file) {
  return file.endsWith('.md') && FOLDERS.includes(file.split('/')[0]);
}

export function checkBoundaryWords(report, repository, { baseDir = null, env = process.env } = {}) {
  const root = repository.root;
  let baseFiles;
  let baseText;
  if (baseDir !== null) {
    baseFiles = FOLDERS.flatMap((folder) => {
      const start = path.join(baseDir, folder);
      if (!fs.existsSync(start)) return [];
      return fs.readdirSync(start, { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => path.relative(baseDir, path.join(entry.parentPath, entry.name)).split(path.sep).join('/'));
    });
    baseText = (file) => fs.readFileSync(path.join(baseDir, file), 'utf8');
  } else {
    const listing = git(root, ['ls-tree', '-r', '--name-only', BASE_REF, '--', ...FOLDERS]);
    if (listing.status !== 0) {
      report.result('UNRUN', NAME, `${BASE_REF} is not available to compare against`);
      return;
    }
    baseFiles = listing.stdout.split('\n').filter((file) => file !== '');
    baseText = (file) => git(root, ['show', `${BASE_REF}:${file}`]).stdout;
  }

  const allowed = allowances(root, env);
  const drops = [];
  for (const file of baseFiles.filter(isProse).sort()) {
    const headFile = path.join(root, file);
    if (!fs.existsSync(headFile)) continue;
    const base = countWords(baseText(file));
    const head = countWords(fs.readFileSync(headFile, 'utf8'));
    for (const word of WORDS) {
      if (head[word] < base[word] && !allowed.has(`${word} in ${file}`)) drops.push(`${file}: ${word} ${base[word]} -> ${head[word]}`);
    }
  }
  report.assert(
    drops.length === 0,
    NAME,
    `no prose file under ${FOLDERS.join(', ')} lost a boundary word against ${BASE_REF}`,
    `${drops.join('; ')}; restore the word, or name a deliberate drop as \`Drops: <word> in <path>\` in the plan task's field line or the commit body`
  );
}

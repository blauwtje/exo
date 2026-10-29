import { execFileSync } from 'node:child_process';
import { BYTES_PER_TOKEN } from '#context-limits';

const HUNK_HEADER = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/;

const tokensOf = (text) => Math.ceil(Buffer.byteLength(text) / BYTES_PER_TOKEN);

function hunkOf(text) {
  const [, start, count] = HUNK_HEADER.exec(text);
  const lines = count === undefined ? 1 : Number(count);
  return { start: Number(start), end: Number(start) + Math.max(lines, 1) - 1, text, tokens: tokensOf(text) };
}

function fileOf(section, taskOf) {
  const [header, ...hunkTexts] = section.split(/^(?=@@ )/m);
  const name = header.split('\n', 1)[0].replace(/^diff --git /, '');
  const filePath = name.slice(name.lastIndexOf(' b/') + 3);
  return { path: filePath, task: taskOf.get(filePath) ?? null, header, hunks: hunkTexts.map(hunkOf), tokens: tokensOf(section) };
}

export function branchFiles({ checkout, base, head, taskOf = new Map() }) {
  const diff = execFileSync('git', ['-C', checkout, '-c', 'core.quotepath=off', 'diff', '--no-color', '--no-ext-diff', `${base}...${head}`], { encoding: 'utf8', maxBuffer: Infinity });
  return diff.split(/^(?=diff --git )/m).filter((section) => section !== '').map((section) => fileOf(section, taskOf));
}

function splitFile(file, budget) {
  if (file.tokens <= budget) return [file];
  const pieces = [];
  let hunks = [];
  let tokens = 0;
  const close = () => {
    if (hunks.length > 0) pieces.push({ ...file, hunks, tokens, split: true });
    hunks = [];
    tokens = 0;
  };
  for (const hunk of file.hunks) {
    if (tokens + hunk.tokens > budget) close();
    hunks.push(hunk);
    tokens += hunk.tokens;
  }
  close();
  return pieces;
}

function groupsOf(files) {
  const groups = new Map();
  for (const file of files) groups.set(file.task, [...(groups.get(file.task) ?? []), file]);
  const order = (task) => task ?? Number.POSITIVE_INFINITY;
  return [...groups.entries()].sort(([a], [b]) => order(a) - order(b)).map(([, group]) => group);
}

const sumOf = (files) => files.reduce((total, file) => total + file.tokens, 0);

function unitsOf(files, budget) {
  return groupsOf(files).flatMap((group) => {
    if (sumOf(group) <= budget) return [group];
    return group.flatMap((file) => splitFile(file, budget)).map((piece) => [piece]);
  });
}

export function shardBranch(files, budget) {
  const shards = [];
  let current = { files: [], tokens: 0 };
  for (const unit of unitsOf(files, budget)) {
    const tokens = sumOf(unit);
    if (current.files.length > 0 && current.tokens + tokens > budget) {
      shards.push(current);
      current = { files: [], tokens: 0 };
    }
    current = { files: [...current.files, ...unit], tokens: current.tokens + tokens };
  }
  return current.files.length === 0 ? [current] : [...shards, current];
}

export function shardDiffText(shard) {
  return shard.files.map((file) => file.header + file.hunks.map((hunk) => hunk.text).join('')).join('');
}

export function shardFileLines(shard) {
  return shard.files.map((file) => {
    if (!file.split) return `- ${file.path}`;
    const ranges = file.hunks.map((hunk) => `${hunk.start}-${hunk.end}`).join(', ');
    return `- ${file.path} (new-side lines ${ranges} only)`;
  });
}

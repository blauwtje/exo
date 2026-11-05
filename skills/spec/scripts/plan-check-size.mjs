import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { environmentMs } from '#script-flags';
import { defaultBase } from '#plan-landed';
import { BYTES_PER_TOKEN, capHeadroomTokens, TASK_SPLIT_TOKENS } from '#context-limits';
import { reachesThrough } from './plan-check-files.mjs';

const NAMED_HEADING = /`(#{1,6}) ([^`\n]+)`/g;

const BODY_SIZE_TIMEOUT_MS = 60_000;
const TINY_TASK_TOKENS = 2000;
const TINY_TASK_BYTES = TINY_TASK_TOKENS * BYTES_PER_TOKEN;

function bytesUnder(target) {
  let stat;
  try {
    stat = fs.lstatSync(target);
  } catch {
    return 0;
  }
  if (!stat.isDirectory()) return stat.size;
  return fs.readdirSync(target).reduce((total, name) => total + bytesUnder(path.join(target, name)), 0);
}

function bytesAtCommit(root, commit, target) {
  const listing = spawnSync('git', ['-C', root, 'ls-tree', '-r', '-l', '-z', commit, '--', target], { encoding: 'utf8', maxBuffer: Infinity });
  if (listing.status !== 0) return 0;
  return listing.stdout
    .split('\0')
    .map((entry) => entry.match(/^\d+ blob \w+ +(\d+)\t/))
    .filter((match) => match !== null)
    .reduce((total, match) => total + Number(match[1]), 0);
}

export function forkPointOf(root) {
  const base = defaultBase(root);
  if (base === null) return null;
  const fork = spawnSync('git', ['-C', root, 'merge-base', base, 'HEAD'], { encoding: 'utf8' });
  return fork.status === 0 ? fork.stdout.trim() : null;
}

function textAtCommit(root, commit, target) {
  const shown = spawnSync('git', ['-C', root, 'show', `${commit}:${target}`], { encoding: 'utf8', maxBuffer: Infinity });
  return shown.status === 0 ? shown.stdout : null;
}

function textOnDisk(target) {
  try {
    return fs.readFileSync(target, 'utf8');
  } catch {
    return null;
  }
}

function linesEqual(lines, target) {
  return lines.flatMap((line, index) => (line === target ? [index] : []));
}

function headingSectionBytes(text, taskText) {
  const named = [...taskText.matchAll(NAMED_HEADING)].map((match) => ({ level: match[1].length, line: `${match[1]} ${match[2]}` }));
  if (named.length === 0) return null;
  const outerLevel = Math.min(...named.map((heading) => heading.level));
  const outers = named.filter((heading) => heading.level === outerLevel);
  if (outers.length !== 1) return null;
  const lines = text.split('\n');
  const starts = linesEqual(lines, outers[0].line);
  if (starts.length !== 1) return null;
  const closing = new RegExp(`^#{1,${outerLevel}} `);
  const following = lines.findIndex((line, index) => index > starts[0] && closing.test(line));
  const section = lines.slice(starts[0], following === -1 ? lines.length : following);
  if (named.some((heading) => linesEqual(section, heading.line).length !== 1)) return null;
  return Buffer.byteLength(section.join('\n'));
}

function referencingLinesBytes(text, others) {
  const paths = others.map((other) => other.path).filter((otherPath) => !otherPath.endsWith('/'));
  const matching = text.split('\n').filter((line) => paths.some((otherPath) => line.includes(otherPath)));
  return matching.length === 0 ? null : Buffer.byteLength(matching.join('\n'));
}

function taskBytes(task, root, forkPoint) {
  const wholeSize = (file) => (forkPoint === null ? bytesUnder(path.join(root, file.path)) : bytesAtCommit(root, forkPoint, file.path));
  const textOf = (file) => (forkPoint === null ? textOnDisk(path.join(root, file.path)) : textAtCommit(root, forkPoint, file.path));
  const sizeOf = (file) => {
    const text = textOf(file);
    const referencing = text === null ? null : referencingLinesBytes(text, task.files.filter((other) => other !== file));
    if (referencing !== null) return referencing;
    if (!file.path.endsWith('.md')) return wholeSize(file);
    return (text === null ? null : headingSectionBytes(text, task.section)) ?? wholeSize(file);
  };
  return Buffer.byteLength(task.section) + task.files.reduce((total, file) => total + sizeOf(file), 0);
}

// why: two adjacent tiny tasks on the same files and one chain each pay a session start that one merged task would pay once.
export function warnTinyTasks(tasks, { root, forkPoint, landed }) {
  if (root === undefined || root === null) return [];
  const byNumber = new Map(tasks.map((task) => [task.number, task]));
  const tiny = (task) => !landed.includes(task.number) && taskBytes(task, root, forkPoint) < TINY_TASK_BYTES;
  const warnings = [];
  for (let i = 0; i + 1 < tasks.length; i++) {
    const [first, second] = [tasks[i], tasks[i + 1]];
    const secondPaths = new Set(second.files.map((file) => file.path));
    if (!first.files.some((file) => secondPaths.has(file.path))) continue;
    if (!reachesThrough(byNumber, second.number, first.number)) continue;
    if (tiny(first) && tiny(second)) warnings.push(`warning: Task ${first.number} and Task ${second.number} are both tiny (under ${TINY_TASK_TOKENS} tokens of task text and Files:) and share Files: and a Depends on chain: merge them into one task`);
  }
  return warnings;
}

function rootBodySizes(root) {
  const verify = (name) => JSON.stringify(pathToFileURL(path.join(root, 'verify', name)).href);
  const script = `const [{ bodySizes }, { createRepository }] = await Promise.all([import(${verify('body-size.mjs')}), import(${verify('repository.mjs')})]); process.stdout.write(JSON.stringify(bodySizes(createRepository(process.argv[1]))));`;
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', script, root], { encoding: 'utf8', timeout: environmentMs('EXO_BODY_SIZE_TIMEOUT_MS', BODY_SIZE_TIMEOUT_MS), maxBuffer: Infinity });
  if (child.status !== 0) return { reason: (child.stderr || child.error?.message || 'no output').trim().split('\n')[0] };
  return { records: JSON.parse(child.stdout) };
}

const dirOf = (file) => path.posix.dirname(file);

// why: a task that edits a skill or agent already near its body cap fails the verify budget check after landing; the plan can raise the lock in the same task instead.
export function warnNearCap(tasks, root, landed) {
  if (root === undefined || root === null || !fs.existsSync(path.join(root, 'verify/budgets.mjs'))) return [];
  const sized = rootBodySizes(root);
  if (sized.reason !== undefined) return [`warning: headroom check skipped, the root's verify/body-size.mjs failed: ${sized.reason}`];
  const limit = capHeadroomTokens();
  const near = new Map(sized.records.filter((record) => record.headroom < limit).map((record) => [record.path, record]));
  const withReferences = new Set();
  return tasks.flatMap((task) => {
    for (const file of task.files) if (file.path.includes('/references/')) withReferences.add(file.path.slice(0, file.path.indexOf('/references/')));
    if (landed.includes(task.number)) return [];
    return task.files
      .filter((file) => near.has(file.path) && !withReferences.has(dirOf(file.path)))
      .map((file) => `warning: Task ${task.number} edits ${file.path}, which has ${near.get(file.path).headroom} tokens of body headroom (cap ${near.get(file.path).cap}): trim it in the same task or raise its cap`);
  });
}

export function checkContextSize(task, root, forkPoint) {
  if (root === undefined || root === null) return [];
  const bytes = taskBytes(task, root, forkPoint);
  const tokens = Math.ceil(bytes / BYTES_PER_TOKEN);
  if (tokens <= TASK_SPLIT_TOKENS) return [];
  return [`Task ${task.number}: split Task ${task.number} (about ${tokens} tokens of task text and Files:, over ${TASK_SPLIT_TOKENS})`];
}

export function sizeLines(tasks, root, forkPoint) {
  if (root === undefined || root === null) return [];
  return tasks.map((task) => `Task ${task.number}: about ${Math.ceil(taskBytes(task, root, forkPoint) / BYTES_PER_TOKEN)} tokens of task text and Files:`);
}

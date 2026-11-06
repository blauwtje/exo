import { spawnSync } from 'node:child_process';
import { gitLine } from '#git';

const CLEAN = 0;
const CONFLICTED = 1;

export function unmergedPaths(root) {
  const lines = (gitLine(root, ['ls-files', '-u']) ?? '').split('\n').filter(Boolean);
  return [...new Set(lines.map((line) => line.split('\t').slice(1).join('\t')))];
}

export function unfinishedMerge(root) {
  const files = unmergedPaths(root);
  const mergeHead = gitLine(root, ['rev-parse', '-q', '--verify', 'MERGE_HEAD']);
  const pickHead = gitLine(root, ['rev-parse', '-q', '--verify', 'CHERRY_PICK_HEAD']);
  if (files.length === 0 && mergeHead === null && pickHead === null) return null;
  return { files, mergeHead, pickHead };
}

export function conflictMarkers(root, files) {
  if (files.length === 0) return [];
  const found = spawnSync('git', ['-C', root, 'grep', '--no-index', '-l', '-E', '^(<{7}|>{7})( |$)', '--', ...files], { encoding: 'utf8' });
  return found.stdout.split('\n').filter(Boolean);
}

export function squashConflicts(root, branch, target = 'HEAD') {
  const args = ['-C', root, 'merge-tree', '--write-tree', '--name-only', '--no-messages', '-z', target, branch];
  const merge = spawnSync('git', args, { encoding: 'utf8' });
  if (merge.status === CLEAN) return [];
  if (merge.status !== CONFLICTED) return null;
  return merge.stdout.split('\0').slice(1).filter(Boolean);
}

function targetName(root) {
  return gitLine(root, ['symbolic-ref', '-q', '--short', 'HEAD']) ?? 'HEAD';
}

export function unfinishedMergeNote(root) {
  const unfinished = unfinishedMerge(root);
  if (unfinished === null) return null;
  const paths = unfinished.files.length === 0 ? 'none left unmerged' : unfinished.files.join(', ');
  return `${targetName(root)} has an unfinished merge (unmerged paths: ${paths}); finish or abort it first`;
}

const MAX_BUFFER = 256 * 1024 * 1024;

function gitText(root, args) {
  const answer = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8', maxBuffer: MAX_BUFFER });
  return answer.status === 0 ? answer.stdout : null;
}

function lineCounts(root, revision, file) {
  const counts = new Map();
  for (const line of (gitText(root, ['show', `${revision}:${file}`]) ?? '').split('\n')) {
    counts.set(line, (counts.get(line) ?? 0) + 1);
  }
  return counts;
}

function blobId(root, revision, file) {
  return gitLine(root, ['rev-parse', '-q', '--verify', `${revision}:${file}`]);
}

function branchChangeHolds(base, branch, target) {
  let changed = false;
  for (const line of new Set([...base.keys(), ...branch.keys()])) {
    const before = base.get(line) ?? 0;
    const after = branch.get(line) ?? 0;
    const there = target.get(line) ?? 0;
    if (after === before) continue;
    changed = true;
    if (after > before && there < after) return false;
    if (after < before && there > after) return false;
  }
  return changed;
}

function fileLanded(root, revisions, file) {
  const { base, branch, target } = revisions;
  if (blobId(root, branch, file) === blobId(root, target, file)) return true;
  return branchChangeHolds(lineCounts(root, base, file), lineCounts(root, branch, file), lineCounts(root, target, file));
}

export function landedOnTarget(root, branch, target = 'HEAD') {
  const base = gitLine(root, ['merge-base', target, branch]);
  if (base === null) return false;
  const listing = gitText(root, ['diff', '--name-only', '--no-renames', '-z', base, branch]) ?? '';
  const files = listing.split('\0').filter(Boolean);
  return files.length > 0 && files.every((file) => fileLanded(root, { base, branch, target }, file));
}

export function squashBlock(root, branch) {
  const note = unfinishedMergeNote(root);
  if (note !== null) return { problem: note, fix: null };
  const conflicts = squashConflicts(root, branch);
  if (conflicts === null || conflicts.length === 0) return null;
  const target = targetName(root);
  if (landedOnTarget(root, branch)) return { problem: `${branch} already landed on ${target}`, fix: 'nothing left to squash', landed: true };
  return { problem: `${branch} conflicts with ${target} in: ${conflicts.join(', ')}`, fix: `rebase it onto ${target} first` };
}

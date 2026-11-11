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

function squashConflicts(root, branch, target = 'HEAD') {
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

function patchIds(root, text) {
  const answer = spawnSync('git', ['-C', root, 'patch-id', '--stable'], { input: text, encoding: 'utf8', maxBuffer: MAX_BUFFER });
  return answer.stdout.split('\n').filter(Boolean).map((line) => line.split(' ')[0]);
}

function cherryLanded(root, branch, target) {
  const lines = (gitText(root, ['cherry', target, branch]) ?? '').split('\n').filter(Boolean);
  return lines.length > 0 && lines.every((line) => line.startsWith('-'));
}

function combinedPatchLanded(root, branch, target) {
  const base = gitLine(root, ['merge-base', target, branch]);
  if (base === null) return false;
  const [combined] = patchIds(root, gitText(root, ['diff', base, branch]) ?? '');
  if (combined === undefined) return false;
  return patchIds(root, gitText(root, ['log', '-p', '--no-merges', `${base}..${target}`]) ?? '').includes(combined);
}

function landedOnTarget(root, branch, target = 'HEAD') {
  return cherryLanded(root, branch, target) || combinedPatchLanded(root, branch, target);
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

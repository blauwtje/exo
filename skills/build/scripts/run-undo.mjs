import fs from 'node:fs';
import process from 'node:process';
import { Refusal, checkoutRoot } from './cli-refusal.mjs';
import { readOps } from './run-state.mjs';
import { gitResult } from '#git';

const shortSha = (sha) => (sha === null ? 'none' : sha.slice(0, 7));
const refSha = (root, ref) => {
  const found = gitResult(root, ['rev-parse', '-q', '--verify', ref]);
  return found.ok ? found.text : null;
};

function checkedOutAt(root, ref) {
  const listed = gitResult(root, ['worktree', 'list', '--porcelain']).text.split('\n\n');
  const entry = listed.find((block) => block.split('\n').includes(`branch ${ref}`));
  return entry === undefined ? null : entry.split('\n')[0].slice('worktree '.length);
}

const isDirty = (tree) => gitResult(tree, ['status', '--porcelain']).text !== '';
const refused = (text) => ({ status: 'refused', text });
const settled = (text) => ({ status: 'already', text });

function reverseRef(root, id, op) {
  const current = refSha(root, op.ref);
  const label = `${op.ref} ${shortSha(op.after)} -> ${shortSha(op.before)}`;
  if (current === op.before) return settled(`${label}: already undone`);
  if (current !== op.after) return refused(`${label}: ${op.ref} is now at ${shortSha(current)}, not the recorded ${shortSha(op.after)}`);
  const holder = checkedOutAt(root, op.ref);
  const backup = `refs/exo/undo/${id}/${op.ref.replace(/^refs\//, '')}`;
  if (op.after === null) {
    if (!gitResult(root, ['cat-file', '-e', `${op.before}^{commit}`]).ok) return refused(`${label}: commit ${shortSha(op.before)} is gone`);
    return { status: 'would', text: `${label}: recreate the deleted ref`, run: () => gitResult(root, ['update-ref', op.ref, op.before, '']) };
  }
  if (holder !== null && isDirty(holder)) return refused(`${label}: checked out in ${holder} with uncommitted work`);
  if (op.before === null) {
    if (holder !== null) return refused(`${label}: checked out in ${holder}; remove that worktree first`);
    return {
      status: 'would',
      text: `${label}: remove the created ref, backup ${backup}`,
      run: () => {
        gitResult(root, ['update-ref', backup, op.after]);
        return gitResult(root, ['update-ref', '-d', op.ref, op.after]);
      },
    };
  }
  return {
    status: 'would',
    text: `${label}: move the ref back, backup ${backup}`,
    run: () => {
      gitResult(root, ['update-ref', backup, op.after]);
      return holder === null ? gitResult(root, ['update-ref', op.ref, op.before, op.after]) : gitResult(holder, ['reset', '--hard', '-q', op.before]);
    },
  };
}

function reverseHead(op) {
  const now = gitResult(op.root, ['symbolic-ref', '-q', 'HEAD']).text || null;
  const label = `HEAD of ${op.root} ${op.after ?? 'detached'} -> ${op.before ?? 'detached'}`;
  if (now === op.before) return settled(`${label}: already undone`);
  if (now !== op.after) return refused(`${label}: HEAD is now ${now ?? 'detached'}`);
  if (op.before === null) return { status: 'manual', text: `${label}: left as is, the checkout was detached before the run` };
  if (isDirty(op.root)) return refused(`${label}: ${op.root} has uncommitted work`);
  return { status: 'would', text: `${label}: switch back`, run: () => gitResult(op.root, ['switch', op.before.replace(/^refs\/heads\//, '')]) };
}

function reverseWorktree(op) {
  if (!fs.existsSync(op.path)) return settled(`worktree ${op.path}: already gone`);
  const state = isDirty(op.path) ? 'has uncommitted work' : 'is clean';
  return { status: 'manual', text: `worktree ${op.path} ${state}; undo leaves it in place, you remove it when done` };
}

const reversePush = (op) => ({
  status: 'manual',
  text: `pushed ${op.sha.slice(0, 7)} to ${op.remote}/${op.ref}; remote operations are not reversed, revert it on the remote yourself`,
});

const REVERSERS = {
  ref: (root, id, op) => reverseRef(root, id, op),
  head: (root, id, op) => reverseHead(op),
  worktree: (root, id, op) => reverseWorktree(op),
  push: (root, id, op) => reversePush(op),
};

export function planUndo(root, id, ops) {
  return [...ops].reverse().map((op) => (REVERSERS[op.kind] ?? (() => refused(`unknown operation ${op.kind}`)))(root, id, op));
}

function settle(item, apply) {
  if (!apply || item.status !== 'would') return item;
  const done = item.run();
  return done.ok ? { status: 'done', text: item.text } : refused(`${item.text}: ${done.error.split('\n')[0]}`);
}

export function undoRun(root, id, { apply }) {
  const ops = readOps(root, id);
  if (ops.length === 0) throw new Refusal(`run ${id} recorded no operations in this checkout`);
  const items = [];
  for (const op of [...ops].reverse()) {
    const item = planUndo(root, id, [op])[0];
    const blocked = items.some((earlier) => earlier.status === 'refused');
    items.push(blocked && item.status === 'would' ? { status: 'skipped', text: `${item.text}: not applied, a later step was refused` } : settle(item, apply));
  }
  return {
    lines: items.map((item) => `${item.status}: ${item.text}`),
    refused: items.filter((item) => item.status === 'refused').length,
    pending: items.filter((item) => item.status === 'would').length,
  };
}

export function undoCommand(args) {
  const apply = args.includes('--apply');
  const ids = args.filter((arg) => arg !== '--apply');
  if (ids.length !== 1 || ids[0].startsWith('-')) throw new Refusal('usage: exo undo <id> [--apply]');
  const result = undoRun(checkoutRoot(), ids[0], { apply });
  process.stdout.write(`${result.lines.join('\n')}\n`);
  const plural = result.pending === 1 ? '' : 's';
  if (!apply) process.stdout.write(`exo: dry run, nothing changed; ${result.pending} step${plural} to apply with: exo undo ${ids[0]} --apply\n`);
  if (apply) process.stdout.write(`exo: moved refs are kept under refs/exo/undo/${ids[0]}/; restore one with git update-ref <ref> <backup>\n`);
  return result.refused === 0 ? 0 : 3;
}

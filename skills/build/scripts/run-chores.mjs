import process from 'node:process';
import { Refusal } from './cli-refusal.mjs';
import { worktrees } from './run-checkout.mjs';
import { gitResult } from '#git';

export function updateDefault(root, base, needed) {
  if (gitResult(root, ['remote']).text === '') return;
  if (!gitResult(root, ['fetch', '--prune']).ok) {
    process.stdout.write('exo: git fetch failed; going on with the local default branch\n');
    return;
  }
  const upstream = gitResult(root, ['rev-parse', '-q', '--verify', `refs/remotes/origin/${base}`]).text;
  const local = gitResult(root, ['rev-parse', '-q', '--verify', `refs/heads/${base}`]).text;
  if (upstream === '' || local === '' || upstream === local) return;
  if (gitResult(root, ['merge-base', '--is-ancestor', upstream, local]).ok) return;
  if (!gitResult(root, ['merge-base', '--is-ancestor', local, upstream]).ok) {
    if (!needed) {
      process.stdout.write(`exo: warning: ${base} and origin/${base} have diverged; going on with the existing plan branch\n`);
      return;
    }
    throw new Refusal(`refused: ${base} and origin/${base} have diverged; rebase or reset ${base} onto origin/${base} yourself, then rerun exo run`);
  }
  const holder = worktrees(root).find((tree) => tree.branch === base);
  const moved = holder === undefined
    ? gitResult(root, ['update-ref', '-m', 'exo: fast-forward', `refs/heads/${base}`, upstream, local])
    : gitResult(holder.path, ['merge', '--ff-only', upstream]);
  if (!moved.ok) throw new Refusal(`refused: could not fast-forward ${base} to origin/${base}: ${moved.error}`);
  process.stdout.write(`exo: fast-forwarded ${base} to origin/${base}\n`);
}

export function cleanUp(root, base, keep) {
  gitResult(root, ['worktree', 'prune']);
  const merged = gitResult(root, ['branch', '--merged', base, '--format=%(refname:short)']).text.split('\n').filter(Boolean);
  const gone = gitResult(root, ['for-each-ref', '--format=%(refname:short)\t%(upstream:track)', 'refs/heads']).text
    .split('\n').filter((line) => line.endsWith('\t[gone]')).map((line) => line.split('\t')[0]);
  const checkedOut = worktrees(root).map((tree) => tree.branch);
  for (const name of merged) {
    if (name === base || keep.includes(name) || !gone.includes(name) || checkedOut.includes(name)) continue;
    const deleted = gitResult(root, ['branch', '-d', name]);
    process.stdout.write(deleted.ok ? `exo: removed branch ${name}\n` : `exo: kept branch ${name}: ${deleted.error}\n`);
  }
}

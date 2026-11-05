import { spawnSync } from 'node:child_process';
import { defaultBranch } from '#git';
import { gitOut } from './run-worktree.mjs';

export function rebaseOntoMovedBase(ctx) {
  const { root, branch, say } = ctx;
  const base = defaultBranch(root);
  if (base === null || base === branch) return;
  const hasBase = gitOut(root, ['rev-parse', '--verify', '--quiet', `refs/heads/${base}`]) !== null;
  if (!hasBase) return;
  const dirty = gitOut(root, ['status', '--porcelain', '--untracked-files=no'], { trim: false });
  if (dirty !== '') return;
  let target = `refs/heads/${base}`;
  const noteFetch = (why) => {
    if (ctx.fetchNoted) return;
    ctx.fetchNoted = true;
    say(`${why}, rebasing onto local ${base}`);
  };
  if (spawnSync('git', ['-C', root, 'remote', 'get-url', 'origin']).status !== 0) noteFetch('no origin remote');
  else if (spawnSync('git', ['-C', root, 'fetch', 'origin'], { encoding: 'utf8' }).status !== 0) noteFetch('fetch origin failed');
  else if (gitOut(root, ['rev-parse', '--verify', '--quiet', `refs/remotes/origin/${base}`]) === null) noteFetch(`origin/${base} missing`);
  else {
    const localAhead = spawnSync('git', ['-C', root, 'merge-base', '--is-ancestor', `origin/${base}`, base]).status === 0
      && gitOut(root, ['rev-parse', base]) !== gitOut(root, ['rev-parse', `origin/${base}`]);
    if (!localAhead) target = `origin/${base}`;
  }
  const contained = spawnSync('git', ['-C', root, 'merge-base', '--is-ancestor', target, 'HEAD']).status === 0;
  if (contained) return;
  const rebase = spawnSync('git', ['-C', root, 'rebase', target], { encoding: 'utf8' });
  if (rebase.status === 0) {
    say(`rebased onto ${target.replace('refs/heads/', '')}`);
    return;
  }
  spawnSync('git', ['-C', root, 'rebase', '--abort']);
  const shown = target.replace('refs/heads/', '');
  say(`rebase onto ${shown} failed, task runs on the old base`);
  return { conflict: shown };
}

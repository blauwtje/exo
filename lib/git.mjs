import { spawnSync } from 'node:child_process';

export function gitLine(root, args) {
  const answer = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' });
  return answer.status === 0 ? answer.stdout.trim() : null;
}

export function originDefaultBranch(root) {
  const remote = gitLine(root, ['symbolic-ref', '-q', '--short', 'refs/remotes/origin/HEAD']);
  return remote === null ? null : remote.replace(/^origin\//, '');
}

export function defaultRef(root) {
  const remote = originDefaultBranch(root);
  if (remote !== null) return { name: remote, ref: 'refs/remotes/origin/HEAD' };
  const local = ['main', 'master'].find((name) => gitLine(root, ['rev-parse', '-q', '--verify', `refs/heads/${name}`]) !== null);
  return local === undefined ? null : { name: local, ref: `refs/heads/${local}` };
}

export function defaultBranch(root) {
  return defaultRef(root)?.name ?? null;
}

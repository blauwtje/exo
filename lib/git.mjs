import { execFileSync, spawnSync } from 'node:child_process';

const MAX_BUFFER = 256 * 1024 * 1024;
const QUIET_STDIN = ['ignore', 'pipe', 'pipe'];

export function git(root, args, options = {}) {
  return spawnSync('git', ['-C', root, ...args], { encoding: 'utf8', maxBuffer: MAX_BUFFER, ...options });
}

export function gitText(root, args, { trim = true, ...options } = {}) {
  const output = execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', maxBuffer: MAX_BUFFER, stdio: QUIET_STDIN, ...options });
  return trim ? output.trim() : output;
}

export function gitResult(root, args, options = {}) {
  const done = git(root, args, options);
  return { ok: done.status === 0, text: (done.stdout ?? '').trim(), error: (done.stderr ?? '').trim().split('\n')[0] };
}

export function gitLine(root, args, { trim = true, ...options } = {}) {
  const answer = git(root, args, options);
  if (answer.status !== 0) return null;
  return trim ? answer.stdout.trim() : answer.stdout;
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

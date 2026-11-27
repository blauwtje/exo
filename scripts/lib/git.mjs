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

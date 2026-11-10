import { appendFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

export const FULL_NEXT = 'NEXT rerun with --full in the background; progress: tail .exo/gate-progress.log';

export function gateArgs(flags) {
  return ['--plan', flags.plan, '--root', flags.root, '--base', flags.base];
}

export function logProgress(root, text) {
  mkdirSync(path.join(root, '.exo'), { recursive: true });
  appendFileSync(path.join(root, '.exo', 'gate-progress.log'), `${new Date().toISOString()} ${text}\n`);
}

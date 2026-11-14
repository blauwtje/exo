import { spawnSync } from 'node:child_process';
import process from 'node:process';
import { SCRIPT } from './run-session-paths.mjs';

const node = (script, args, root) => spawnSync(process.execPath, [script, ...args], {
  cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, env: { ...process.env, EXO_RUN_TASK: undefined }
});

export function runTail({ planPath, root, exec = node }) {
  return { gate: exec(SCRIPT.gate, ['--plan', planPath, '--root', root], root) };
}

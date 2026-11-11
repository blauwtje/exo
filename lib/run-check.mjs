import { cachedPass, judgeLog, recordPass, workingTreeKey } from './check-cache.mjs';
import process from 'node:process';
import { isMain } from '#script-flags';
import { runTree, runTreeSync } from './process-tree.mjs';

const CHECK_TIMEOUT_MS = 600000;

function envKey(command, env) {
  const names = [...new Set([...Object.keys(env), ...Object.keys(process.env)])].sort();
  const changed = names.filter((name) => env[name] !== process.env[name]).map((name) => `${name}=${env[name] ?? ''}`);
  return changed.length === 0 ? command : `${command}\nenv ${changed.join(' ')}`;
}

function settled(root, key, command, run, { before, started, record }) {
  const ms = Date.now() - started;
  const ok = run.status === 0 && !run.timedOut;
  const judged = judgeLog(command, run.output).pass;
  const judgedPass = judged === true || judged === null;
  if (record && ok && judgedPass && command.trim() !== '') recordPass(root, key, ms, before, run.output);
  return { ok: ok && judgedPass, cached: false, code: run.status, signal: run.signal ?? null, error: run.error, timedOut: run.timedOut === true, output: run.output, ms };
}

function cachedResult(root, key, command, fresh) {
  const hit = fresh ? null : cachedPass(root, key, command);
  return hit === null ? null : { ok: true, cached: true, code: 0, signal: null, output: '', ms: hit.ms };
}

export function runCheck(root, command, { timeoutMs = CHECK_TIMEOUT_MS, record = true, env = process.env, fresh = false } = {}) {
  const key = envKey(command, env);
  const cached = cachedResult(root, key, command, fresh);
  if (cached !== null) return cached;
  const state = { before: workingTreeKey(root), started: Date.now(), record };
  return settled(root, key, command, runTreeSync(command, { cwd: root, timeoutMs, env }), state);
}

export async function runCheckAsync(root, command, { timeoutMs = CHECK_TIMEOUT_MS, record = true, env = process.env, fresh = false } = {}) {
  const key = envKey(command, env);
  const cached = cachedResult(root, key, command, fresh);
  if (cached !== null) return cached;
  const state = { before: workingTreeKey(root), started: Date.now(), record };
  return settled(root, key, command, await runTree(command, { cwd: root, timeoutMs, env }), state);
}

if (isMain(import.meta.url)) {
  const outcome = runCheck(process.cwd(), process.argv.slice(2).join(' '));
  process.stdout.write(outcome.cached ? 'cached pass on this tree\n' : outcome.output);
  process.exitCode = outcome.ok ? 0 : 1;
}

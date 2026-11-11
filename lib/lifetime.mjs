import process from 'node:process';
import { environmentMs } from '#script-flags';
import { pollUntil } from './loop-budget.mjs';

const PARENT_POLL_MS = 1000;
const DEADLINE_EXIT = 124;
const PARENT_EXIT = 129;

function leave(name, reason, code) {
  process.stderr.write(`${name}: ${reason}\n`);
  process.exit(code);
}

export function exitWithParent(name, pollMs = PARENT_POLL_MS) {
  const parentPid = process.ppid;
  const controller = new AbortController();
  pollUntil(() => process.ppid !== parentPid, {
    intervalMs: pollMs,
    wallMs: Infinity,
    unref: true,
    signal: controller.signal,
    env: {},
  }).then((gone) => {
    if (gone) leave(name, 'caller ended, exiting', PARENT_EXIT);
  });
  return () => controller.abort();
}

export const SPEC_SEARCH_LIFETIME_MS = 300000;

export function lifetimeMs(name, defaultMs, env = process.env) {
  return environmentMs(`EXO_${name.toUpperCase().replace(/\W+/g, '_')}_MS`, defaultMs, env);
}

export function limitLifetime(name, defaultMs, env = process.env) {
  const ms = lifetimeMs(name, defaultMs, env);
  const stopParent = exitWithParent(name);
  const timer = setTimeout(() => leave(name, `deadline of ${ms} ms passed`, DEADLINE_EXIT), ms);
  timer.unref();
  return () => {
    clearTimeout(timer);
    stopParent();
  };
}

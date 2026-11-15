import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import process from 'node:process';
import { environmentMs } from '../../../lib/script-flags.mjs';
import { orWhenAbsent } from '#absent-path';
import { parseLine, sleep } from '#basics';
import { KILL_GRACE_MS } from '../../../lib/bounded-command.mjs';
import { pollUntil, roundCap } from '../../../lib/loop-budget.mjs';
import { parseStream } from './run-session-stream.mjs';
import { fallbackModel } from './run-plan-provider.mjs';

const PARENT_POLL_MS = 5000;
const TRANSIENT_PROVIDER_ERROR = /\b(?:429|503|529)\b|rate_limit_error|overloaded_error/;

export function appendLog(file, text, write = fs.appendFileSync) {
  orWhenAbsent(() => write(file, text), undefined);
}

const EXIT_CODES = { SIGHUP: 129, SIGINT: 130, SIGTERM: 143 };

function endTree(child, signal) {
  try {
    if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F']);
    else process.kill(-child.pid, signal);
  } catch (error) {
    if (error.code === 'ESRCH') return false;
    throw error;
  }
  return true;
}

function terminateOnSignal(child) {
  const onSignal = (signal) => {
    const leave = () => {
      endTree(child, 'SIGKILL');
      process.exit(EXIT_CODES[signal]);
    };
    endTree(child, 'SIGTERM');
    if (child.exitCode !== null || child.signalCode !== null) leave();
    else {
      child.once('exit', leave);
      setTimeout(leave, KILL_GRACE_MS);
    }
  };
  const signals = Object.keys(EXIT_CODES);
  for (const signal of signals) process.on(signal, onSignal);
  const parentPid = process.ppid;
  const parentWatch = new AbortController();
  pollUntil(() => process.ppid !== parentPid, { intervalMs: PARENT_POLL_MS, wallMs: Infinity, unref: true, signal: parentWatch.signal })
    .then((parentGone) => parentGone && onSignal('SIGHUP'));
  return () => {
    parentWatch.abort();
    for (const signal of signals) process.off(signal, onSignal);
  };
}

function initWatcher() {
  let initSeen = false;
  let partial = '';
  return (chunk) => {
    if (initSeen) return null;
    const lines = (partial + chunk).split('\n');
    partial = lines.pop();
    const init = parseStream(lines.join('\n')).init;
    if (init === null) return null;
    initSeen = true;
    return init;
  };
}

function spawnOnce(claude, args, { cwd, env, prompt, log, timeoutMs, refuseInit }) {
  return new Promise((resolve) => {
    let text = '';
    let timedOut = false;
    let aborted = false;
    let settled = false;
    let graceTimer = null;
    const child = spawn(claude.command, [...claude.prefix, ...args], { cwd, env, stdio: ['pipe', 'pipe', 'pipe'], detached: process.platform !== 'win32' });
    const stopWatching = terminateOnSignal(child);
    const watchInit = initWatcher();
    const settle = (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(graceTimer);
      stopWatching();
      resolve({ text, code, signal, timedOut, aborted });
    };
    const record = (chunk) => {
      text += chunk;
      appendLog(log, chunk);
      const init = watchInit(chunk);
      if (init === null || refuseInit(init) === null) return;
      aborted = true;
      endTree(child, 'SIGKILL');
    };
    child.stdout.setEncoding('utf8').on('data', record);
    child.stderr.setEncoding('utf8').on('data', record);
    child.stdin.on('error', () => {});
    child.stdin.end(prompt);
    child.on('error', (error) => {
      record(`run-plan: spawn failed: ${error.message}\n`);
      settle(null, null);
    });
    child.on('exit', (code, signal) => {
      if (!timedOut && !aborted) {
        clearTimeout(graceTimer);
        graceTimer = setTimeout(() => {
          endTree(child, 'SIGKILL');
          settle(code, signal);
        }, KILL_GRACE_MS);
        return;
      }
      endTree(child, 'SIGKILL');
      settle(code, signal);
    });
    child.on('close', settle);
    const timer = setTimeout(() => {
      timedOut = true;
      endTree(child, 'SIGTERM');
      graceTimer = setTimeout(() => {
        endTree(child, 'SIGKILL');
        settle(null, 'SIGKILL');
      }, KILL_GRACE_MS);
    }, timeoutMs);
  });
}

function isModelContentEvent(line) {
  return ['assistant', 'user', 'system'].includes(parseLine(line)?.type);
}

function isTransientProviderError(text) {
  if (!TRANSIENT_PROVIDER_ERROR.test(text)) return false;
  const { final, resultText } = parseStream(text);
  if (final === null) return text.split(/\r?\n/).some((line) => TRANSIENT_PROVIDER_ERROR.test(line) && !isModelContentEvent(line));
  return final.is_error === true && TRANSIENT_PROVIDER_ERROR.test(resultText);
}

const retriesProviderError = (outcome) => !outcome.timedOut && !outcome.aborted && isTransientProviderError(outcome.text);

function primaryModel(args) {
  const at = args.indexOf('--model');
  return at < 0 ? null : args[at + 1];
}

function withModel(args, model) {
  const at = args.indexOf('--model');
  return at < 0 ? [...args, '--model', model] : args.with(at + 1, model);
}

async function spawnOnFallback({ claude, args, options, outcome }) {
  const from = primaryModel(args);
  const to = fallbackModel(from);
  if (to === null) return outcome;
  appendLog(options.log, `exo: provider overloaded on ${from ?? 'the default model'} after ${roundCap('provider')} retries, running once on ${to}\n`);
  return { ...(await spawnOnce(claude, withModel(args, to), options)), fallback: { from, to } };
}

export async function spawnClaude(claude, args, options) {
  const baseMs = environmentMs('EXO_PROVIDER_RETRY_MS', 30_000);
  const retries = roundCap('provider');
  let outcome = await spawnOnce(claude, args, options);
  for (let retry = 0; retry < retries && retriesProviderError(outcome); retry += 1) {
    await sleep(baseMs * 2 ** retry);
    outcome = await spawnOnce(claude, args, options);
  }
  if (!retriesProviderError(outcome)) return outcome;
  return spawnOnFallback({ claude, args, options, outcome });
}

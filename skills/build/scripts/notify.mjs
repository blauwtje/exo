import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { environmentMs } from '#script-flags';
import { layers, resolve } from '#settings-store';

const POST_TIMEOUT_MS = 5000;
const DONE_PHASES = ['passed', 'landed'];

function planName(plan) {
  return path.basename(plan ?? '', '.md').replace(/[^\w.-]/g, '');
}

export function noticeLine(state, phase, reason) {
  const head = `exo ${planName(state.plan) || state.id}`;
  if (DONE_PHASES.includes(phase)) return `${head}: done (${phase})`;
  if (phase === 'parked') return `${head}: question raised, run ${state.id} parked`;
  if (phase !== 'stopped') return null;
  const task = /\btask (\d+)\b/i.exec(reason ?? '');
  return task === null ? `${head}: stuck` : `${head}: stuck at task ${task[1]}`;
}

function desktopNotice(id, phase) {
  spawnSync('osascript', ['-e', `display notification "exo run ${id.replace(/[^\w.-]/g, '')}: ${phase}" with title "exo"`], { stdio: 'ignore' });
}

function configuredUrl(root) {
  try {
    return resolve('notify', layers(root)).value;
  } catch (error) {
    process.stderr.write(`exo: notify setting unreadable: ${error.message}\n`);
    return '';
  }
}

async function post(url, line) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    body: line,
    signal: AbortSignal.timeout(environmentMs('EXO_NOTIFY_MS', POST_TIMEOUT_MS))
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
}

export async function notifyRun(root, state, phase, reason) {
  desktopNotice(state.id, phase);
  const url = configuredUrl(root);
  if (url === '') return;
  const line = noticeLine(state, phase, reason);
  if (line === null) return;
  if (!/^https?:\/\//i.test(url)) {
    process.stderr.write('exo: notify is not an http(s) url; nothing sent\n');
    return;
  }
  try {
    await post(url, line);
  } catch (error) {
    process.stderr.write(`exo: notify not sent: ${error.message}\n`);
  }
}

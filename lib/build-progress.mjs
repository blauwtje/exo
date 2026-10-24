import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { environmentMs } from './script-flags.mjs';

const STALE_MS = 3600000;

// why: one JSON file per session id lives under ${XDG_CACHE_HOME:-~/.cache}/exo/build/.
const directoryOf = (env) => path.join(env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache'), 'exo', 'build');
const fileOf = (sessionId, env) => path.join(directoryOf(env), `${String(sessionId).replace(/[^\w-]/g, '_')}.json`);
const staleMs = (env) => environmentMs('EXO_BUILD_STALE_MS', STALE_MS, env);

function readRecord(sessionId, env) {
  try {
    const record = JSON.parse(fs.readFileSync(fileOf(sessionId, env), 'utf8'));
    return record !== null && typeof record === 'object' ? record : null;
  } catch {
    return null;
  }
}

// why: a progress write must never fail the script that lands a task.
function writeRecord(record, env) {
  try {
    fs.mkdirSync(directoryOf(env), { recursive: true });
    fs.writeFileSync(fileOf(record.sessionId, env), JSON.stringify(record));
  } catch {
    return;
  }
}

export function readBuildProgress(sessionId, { env = process.env } = {}) {
  return readRecord(sessionId, env);
}

export function writeBuildProgress({ sessionId, plan, checkout, landed, total }, { env = process.env, now = Date.now() } = {}) {
  writeRecord({ sessionId, plan, checkout, landed, total, updatedAt: now }, env);
}

export function refreshBuildProgress({ sessionId, plan, landed, total }, { env = process.env, now = Date.now() } = {}) {
  const record = readRecord(sessionId, env);
  if (record === null || record.plan !== plan) return;
  writeRecord({ ...record, landed, total, updatedAt: now }, env);
}

export function removeBuildProgress(sessionId, { env = process.env } = {}) {
  fs.rmSync(fileOf(sessionId, env), { force: true });
}

function updatedAtOf(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')).updatedAt;
  } catch {
    return null;
  }
}

export function pruneBuildProgress({ env = process.env, now = Date.now() } = {}) {
  const directory = directoryOf(env);
  const names = fs.existsSync(directory) ? fs.readdirSync(directory).filter((name) => name.endsWith('.json')) : [];
  for (const name of names) {
    if (!(now - updatedAtOf(path.join(directory, name)) < staleMs(env))) fs.rmSync(path.join(directory, name), { force: true });
  }
}

export function liveBuild(sessionId, { env = process.env, now = Date.now() } = {}) {
  const record = readRecord(sessionId, env);
  if (record === null) return null;
  const { landed, total, checkout, updatedAt } = record;
  if (!Number.isInteger(landed) || !Number.isInteger(total) || landed >= total) return null;
  if (typeof checkout !== 'string' || !fs.existsSync(checkout)) return null;
  if (!(now - updatedAt < staleMs(env))) return null;
  return { landed, total };
}

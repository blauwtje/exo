#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { inSidecall, readHookText } from '#hook-input';
import { isMain } from '#script-flags';
import { handoffFile } from '../skills/save-session/scripts/handoff.mjs';

const AUTO_MARK = 'Source: auto';
const DIRTY_FILE_CAP = 50;

function git(cwd, ...args) {
  const result = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : null;
}

function entryTime(line) {
  try {
    return Date.parse(JSON.parse(line).timestamp);
  } catch {
    return Number.NaN;
  }
}

function sessionStartMs(transcriptPath) {
  if (typeof transcriptPath !== 'string' || !fs.existsSync(transcriptPath)) return Infinity;
  const lines = fs.readFileSync(transcriptPath, 'utf8').split('\n').filter(Boolean);
  return lines.map(entryTime).find(Number.isFinite) ?? Infinity;
}

function handoffKept(file, startMs) {
  const stat = fs.statSync(file, { throwIfNoEntry: false });
  if (!stat?.isFile()) return false;
  if (stat.mtimeMs > startMs) return true;
  return !fs.readFileSync(file, 'utf8').split('\n').includes(AUTO_MARK);
}

function newestProgressFile(cwd) {
  const folder = path.join(cwd, '.exo');
  if (!fs.existsSync(folder)) return undefined;
  const candidates = fs.readdirSync(folder, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(folder, entry.name, 'progress.md'))
    .map((file) => ({ file, modified: fs.statSync(file, { throwIfNoEntry: false })?.mtimeMs ?? 0 }))
    .filter((candidate) => candidate.modified > 0);
  candidates.sort((first, second) => second.modified - first.modified);
  return candidates[0]?.file;
}

function currentStateLines(dirty, progress) {
  const files = dirty.length === 0 ? ['No uncommitted files.'] : ['Uncommitted files:', ...dirty.map((line) => `- ${line}`)];
  return progress === undefined ? files : [...files, '', `Progress file: ${progress}`];
}

function stubText(cwd, file, dirty, progress) {
  const head = git(cwd, 'rev-parse', '--short', 'HEAD') ?? 'none';
  const branch = git(cwd, 'rev-parse', '--abbrev-ref', 'HEAD') ?? path.basename(path.resolve(cwd));
  return [
    '# Handoff',
    '',
    `Written: ${new Date().toISOString().slice(0, 10)}, HEAD ${head}, branch ${branch}`,
    AUTO_MARK,
    '',
    'The session ended without a handoff; this stub holds only what the files show.',
    '',
    '## Current state',
    '',
    ...currentStateLines(dirty, progress),
    '',
    `Resume: read ${file} and continue the work`,
    ''
  ].join('\n');
}

export function writeHandoffStub({ cwd, transcript_path: transcriptPath }) {
  if (git(cwd, 'rev-parse', '--git-dir') === null) return undefined;
  const file = handoffFile(cwd);
  if (handoffKept(file, sessionStartMs(transcriptPath))) return undefined;
  const dirty = (git(cwd, 'status', '--short') ?? '').split('\n').filter(Boolean).slice(0, DIRTY_FILE_CAP);
  const progress = newestProgressFile(cwd);
  if (dirty.length === 0 && progress === undefined) return undefined;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, stubText(cwd, file, dirty, progress));
  return file;
}

async function handleSessionEnd() {
  try {
    const input = JSON.parse((await readHookText()) || '{}');
    if (typeof input.cwd !== 'string' || input.cwd === '') return;
    writeHandoffStub(input);
  } catch (error) {
    console.error(`exo: handoff stub not written, ${error.message}`);
  }
}

if (isMain(import.meta.url) && !inSidecall() && !process.env.EXO_RUN_DIR) await handleSessionEnd();

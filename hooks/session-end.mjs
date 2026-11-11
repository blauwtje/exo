#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { gitLine } from '#git';
import { inSidecall, readHookText } from '#hook-input';
import { isMain } from '#script-flags';
import { newestProgressFile } from '../lib/session-pointers.mjs';
import { handoffFile } from '../skills/save-session/scripts/handoff.mjs';

const AUTO_MARK = 'Source: auto';
const DIRTY_FILE_CAP = 50;

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

const SKILL_FILE = fileURLToPath(new URL('../skills/save-session/SKILL.md', import.meta.url));
const STUB_FILE = fileURLToPath(new URL('./handoff-stub.md', import.meta.url));
const GOAL_SECTION = /(?:^|\n)## Goal\n([\s\S]*?)(?=\n## |$)/;
const GOAL_MISSING = 'Not recorded, because the session ended before a handoff was written. Ask the user for the goal.';
const RESUME_BLOCK = /^## Resume\n[\s\S]*?```text\n([\s\S]*?)\n```/m;

function stateText(dirty, progress) {
  const changes = dirty.length === 0
    ? ['Every change is saved in a commit.']
    : ['Nothing below is saved in a commit, so do not treat these edits as saved:', ...dirty.map((line) => `- ${line.slice(3)}`)];
  return (progress === undefined ? changes : [...changes, '', `Progress file: ${progress}`]).join('\n');
}

function goalText(progress) {
  if (progress === undefined) return GOAL_MISSING;
  return GOAL_SECTION.exec(fs.readFileSync(progress, 'utf8'))?.[1].trim() || GOAL_MISSING;
}

function stubText(cwd, file, dirty, progress) {
  const values = {
    date: new Date().toISOString().slice(0, 10),
    head: gitLine(cwd, ['rev-parse', '--short', 'HEAD']) ?? 'none',
    branch: gitLine(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']) ?? path.basename(path.resolve(cwd)),
    goal: goalText(progress),
    state: stateText(dirty, progress),
    next: progress === undefined ? 'Look at the changed files, then continue the work.' : 'Read the progress file, then continue the work.',
    paragraph: RESUME_BLOCK.exec(fs.readFileSync(SKILL_FILE, 'utf8'))?.[1] ?? '',
    file
  };
  return fs.readFileSync(STUB_FILE, 'utf8').replace(/\{\{(\w+)\}\}/g, (_, key) => values[key]);
}

function writeHandoffStub({ cwd, transcript_path: transcriptPath }) {
  if (gitLine(cwd, ['rev-parse', '--git-dir']) === null) return undefined;
  const file = handoffFile(cwd);
  if (handoffKept(file, sessionStartMs(transcriptPath))) return undefined;
  const dirty = (gitLine(cwd, ['status', '--short']) ?? '').split('\n').filter(Boolean).slice(0, DIRTY_FILE_CAP);
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

#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { parseArgs } from 'node:util';
import { mad, median } from '../lib/eval-stats.mjs';
import { isFixDispatch } from './fix-round.mjs';
import { isMain } from '#script-flags';

const COUNTS = [
  'assistantTurns',
  'toolCalls',
  'bashCalls',
  'agentDispatches',
  'checkRuns',
  'reviewBranchDispatches',
  'fixReviewDispatches',
  'activeMinutes',
  'totalTokens'
];
const DEFAULT_MIN_SESSIONS = 20;
const MIN_TURNS = 3;
const ACTIVE_GAP_MS = 5 * 60 * 1000;
const TOKEN_FIELDS = ['input_tokens', 'output_tokens', 'cache_read_input_tokens', 'cache_creation_input_tokens'];
const CHECK_COMMAND = /\bnpm (run )?(check|test|t)\b|\bnpm run (validate|test)[\w:.-]*|\bnode (--[\w-]+ \S+ )*--test\b/;
const USAGE = 'usage: session-stats.mjs --repo <name> --before <date> --after <date> [--min-sessions <n>] [--projects <dir>] [--json]';

export function emptyRecord() {
  return {
    startedAt: null,
    cwd: null,
    entrypoint: null,
    userPrompts: 0,
    assistantTurns: 0,
    toolCalls: 0,
    bashCalls: 0,
    agentDispatches: 0,
    checkRuns: 0,
    reviewBranchDispatches: 0,
    fixReviewDispatches: 0,
    totalTokens: 0,
    activeMinutes: 0,
    dispatchTypes: {},
    stamps: []
  };
}

function countDispatch(record, block) {
  const type = block.input?.subagent_type ?? 'general-purpose';
  record.agentDispatches += 1;
  record.dispatchTypes[type] = (record.dispatchTypes[type] ?? 0) + 1;
  if (type.endsWith('review-branch')) record.reviewBranchDispatches += 1;
  if (isFixDispatch(type, block.input?.prompt)) record.fixReviewDispatches += 1;
}

function countToolUse(record, block) {
  record.toolCalls += 1;
  if (block.name === 'Bash' && CHECK_COMMAND.test(String(block.input?.command ?? ''))) record.checkRuns += 1;
  if (block.name === 'Bash') record.bashCalls += 1;
  if (block.name === 'Agent' || block.name === 'Task') countDispatch(record, block);
}

function isFirstSight(message, seen) {
  if (message?.id === undefined) return true;
  if (seen.has(message.id)) return false;
  seen.add(message.id);
  return true;
}

function addUsage(record, message) {
  for (const field of TOKEN_FIELDS) record.totalTokens += message?.usage?.[field] ?? 0;
}

function noteEntry(record, entry) {
  if (entry.timestamp) {
    record.startedAt ??= entry.timestamp;
    record.stamps.push(Date.parse(entry.timestamp));
  }
  record.cwd ??= entry.cwd ?? null;
  record.entrypoint ??= entry.entrypoint ?? null;
}

function isPrompt(entry) {
  if (entry.type !== 'user' || entry.isMeta || entry.isSidechain) return false;
  const content = entry.message?.content;
  return typeof content === 'string' || (Array.isArray(content) && content.some((block) => block.type === 'text'));
}

function countTools(record, entry) {
  const content = entry.message?.content;
  for (const block of Array.isArray(content) ? content : []) if (block.type === 'tool_use') countToolUse(record, block);
}

export function addLine(record, line, seen = new Set()) {
  let entry;
  try {
    entry = JSON.parse(line);
  } catch {
    return;
  }
  noteEntry(record, entry);
  if (isPrompt(entry)) record.userPrompts += 1;
  if (entry.type !== 'assistant') return;
  if (isFirstSight(entry.message, seen)) {
    addUsage(record, entry.message);
    record.assistantTurns += 1;
  }
  countTools(record, entry);
}

async function addFile(record, file, seen) {
  const lines = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });
  for await (const line of lines) addLine(record, line, seen);
}

function finishRecord(record) {
  const stamps = record.stamps.filter(Number.isFinite).sort((a, b) => a - b);
  const gaps = stamps.slice(1).map((stamp, index) => stamp - stamps[index]);
  const active = gaps.filter((gap) => gap <= ACTIVE_GAP_MS).reduce((sum, gap) => sum + gap, 0);
  record.activeMinutes = Math.round(active / 600) / 100;
  record.stamps = [];
  return record;
}

export async function sessionRecord(sessionFile) {
  const record = emptyRecord();
  const seen = new Set();
  await addFile(record, sessionFile, seen);
  const subagentDir = path.join(sessionFile.replace(/\.jsonl$/, ''), 'subagents');
  const names = fs.existsSync(subagentDir) ? fs.readdirSync(subagentDir).filter((entry) => entry.endsWith('.jsonl')) : [];
  for (const name of names) await addFile(record, path.join(subagentDir, name), seen);
  return finishRecord(record);
}

function projectDirs(projectsRoot, repo) {
  const own = new RegExp(`-${repo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(-.*)?$`);
  return fs.readdirSync(projectsRoot).filter((name) => own.test(name)).map((name) => path.join(projectsRoot, name));
}

function sessionFiles(directory) {
  return fs.readdirSync(directory).filter((name) => name.endsWith('.jsonl')).map((name) => path.join(directory, name));
}

function belongsTo(record, repo) {
  return record.cwd === null || record.cwd.split('/').includes(repo);
}

function skipReason(record) {
  if (record.entrypoint === 'sdk-cli') return 'headless';
  if (record.userPrompts === 0 || record.assistantTurns < MIN_TURNS) return 'stub';
  return null;
}

function tally(reason, record, result) {
  if (!reason) return result.records.push(record);
  result.skipped[reason] += 1;
}

export async function loadSessions(projectsRoot, repo) {
  const result = { records: [], skipped: { stub: 0, headless: 0 } };
  for (const directory of projectDirs(projectsRoot, repo)) {
    for (const file of sessionFiles(directory)) {
      const record = await sessionRecord(file);
      const reason = skipReason(record);
      if (reason === 'headless' || belongsTo(record, repo)) tally(reason, record, result);
    }
  }
  return result;
}

const roundTo2 = (value) => Math.round(value * 100) / 100;

export function windowSummary(records) {
  const summary = { sessions: records.length };
  for (const count of COUNTS) {
    const values = records.map((record) => record[count]);
    summary[count] = { median: roundTo2(median(values)), mad: roundTo2(mad(values)) };
  }
  const types = new Set(records.flatMap((record) => Object.keys(record.dispatchTypes)));
  summary.dispatchTypes = {};
  for (const type of [...types].sort()) {
    const values = records.map((record) => record.dispatchTypes[type] ?? 0);
    summary.dispatchTypes[type] = { median: median(values), mad: mad(values) };
  }
  return summary;
}

export function splitWindows(records, { before, after }) {
  const dated = records.filter((record) => record.startedAt !== null);
  return {
    before: dated.filter((record) => record.startedAt.slice(0, 10) < before),
    after: dated.filter((record) => record.startedAt.slice(0, 10) >= after)
  };
}

export function formatReport(windows) {
  const lines = [];
  for (const [name, summary] of Object.entries(windows)) {
    lines.push(`${name}: ${summary.sessions} sessions`);
    for (const count of COUNTS) lines.push(`  ${count}: median ${summary[count].median} mad ${summary[count].mad}`);
    for (const [type, stat] of Object.entries(summary.dispatchTypes).filter(([, item]) => item.median > 0 || item.mad > 0)) lines.push(`  dispatch ${type}: median ${stat.median} mad ${stat.mad}`);
  }
  return lines.join('\n');
}

function parseOptions(argv) {
  const text = { type: 'string' };
  return parseArgs({
    args: argv,
    options: {
      repo: text,
      before: text,
      after: text,
      'min-sessions': { ...text, default: String(DEFAULT_MIN_SESSIONS) },
      projects: { ...text, default: path.join(os.homedir(), '.claude', 'projects') },
      json: { type: 'boolean', default: false }
    }
  }).values;
}

function shortWindows(windows, minimum) {
  const short = Object.entries(windows).filter(([, sessions]) => sessions.length < minimum);
  for (const [name, sessions] of short) console.error(`${name}: ${sessions.length} sessions, need at least ${minimum}`);
  return short.map(([name]) => name);
}

function printSummaries(windows, short, json) {
  const summaries = {};
  for (const [name, sessions] of Object.entries(windows)) {
    if (!short.includes(name)) summaries[name] = windowSummary(sessions);
  }
  if (Object.keys(summaries).length === 0) return;
  console.log(json ? JSON.stringify(summaries, null, 2) : formatReport(summaries));
}

export async function main(argv) {
  const values = parseOptions(argv);
  if (!values.repo || !values.before || !values.after) {
    console.error(USAGE);
    return 2;
  }
  const { records, skipped } = await loadSessions(values.projects, values.repo);
  console.error(`skipped ${skipped.stub} stub and ${skipped.headless} headless sessions`);
  const windows = splitWindows(records, values);
  const short = shortWindows(windows, Number(values['min-sessions']));
  printSummaries(windows, short, values.json);
  return short.length > 0 ? 1 : 0;
}

if (isMain(import.meta.url)) process.exitCode = await main(process.argv.slice(2));

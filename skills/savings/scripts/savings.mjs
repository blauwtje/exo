#!/usr/bin/env node
// Savings: lines, tokens, cost and time per session, read from the transcript
// the harness writes and from the status line it renders, plus two saving
// figures: the bytes the read guard withheld (measured) and what the
// right-sizing ladder saved against the ponytail benchmark ratios (estimated).
//
//   node savings.mjs record      Stop hook: stdin is the hook JSON
//   node savings.mjs statusline  status line: stdin is the status JSON; prints one segment
//   node savings.mjs report      prints the totals table
//
// The transcript format is internal to the harness and may change between
// releases; a line that does not parse is skipped, never fatal, and a hook
// failure never blocks the turn.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { ledgerDirectory, ledgerFile, readJson, updateSession, writeJson } from './ledger.mjs';

const CACHE_READ_RATE = 0.1;
const CACHE_5M_RATE = 1.25;
const CACHE_1H_RATE = 2;
const BYTES_PER_TOKEN = 4;
const RIGHT_SIZING_SKILL = 'exo:right-sizing';
const METRICS = ['lines', 'tokens', 'cost', 'time'];
// Cut per metric that the ponytail agentic benchmark measured against a
// no-skill baseline (DietrichGebert/ponytail, benchmarks/results/2026-06-18-agentic.md,
// twelve feature tasks, Haiku 4.5, n=4). User-editable in config.json;
// readGuard: false switches the read guard off.
const DEFAULT_CONFIG = { readGuard: true, ratios: { lines: 0.54, tokens: 0.22, cost: 0.2, time: 0.27 } };

function loadConfig() {
  const file = path.join(ledgerDirectory(), 'config.json');
  const existing = readJson(file, null);
  // A config that sets only readGuard, as the read guard documents, keeps the default ratios.
  if (existing !== null) return { ...DEFAULT_CONFIG, ...existing, ratios: { ...DEFAULT_CONFIG.ratios, ...existing.ratios } };
  writeJson(file, DEFAULT_CONFIG);
  return DEFAULT_CONFIG;
}

function transcriptFiles(transcriptPath) {
  const files = [transcriptPath];
  const delegatesDirectory = path.join(transcriptPath.replace(/\.jsonl$/, ''), 'subagents');
  if (!fs.existsSync(delegatesDirectory)) return files;
  for (const name of fs.readdirSync(delegatesDirectory).sort()) {
    if (name.endsWith('.jsonl')) files.push(path.join(delegatesDirectory, name));
  }
  return files;
}

// The complete lines appended since the stored byte offset; a trailing partial
// line stays unread until its newline lands.
function appendedLines(file, offset) {
  const size = fs.statSync(file).size;
  if (size <= offset) return { lines: [], offset };
  const buffer = Buffer.alloc(size - offset);
  const descriptor = fs.openSync(file, 'r');
  try {
    fs.readSync(descriptor, buffer, 0, buffer.length, offset);
  } finally {
    fs.closeSync(descriptor);
  }
  const text = buffer.toString('utf8');
  const lastNewline = text.lastIndexOf('\n');
  if (lastNewline < 0) return { lines: [], offset };
  const complete = text.slice(0, lastNewline + 1);
  return { lines: complete.split('\n').slice(0, -1), offset: offset + Buffer.byteLength(complete) };
}

function usageCounts(usage) {
  const creation = usage.cache_creation;
  return {
    input: usage.input_tokens ?? 0,
    cacheRead: usage.cache_read_input_tokens ?? 0,
    cache5m: creation ? (creation.ephemeral_5m_input_tokens ?? 0) : (usage.cache_creation_input_tokens ?? 0),
    cache1h: creation ? (creation.ephemeral_1h_input_tokens ?? 0) : 0,
    output: usage.output_tokens ?? 0
  };
}

function lineCount(text) {
  if (typeof text !== 'string' || text === '') return 0;
  return text.split('\n').length;
}

function patchedLines(toolResult) {
  const counts = { added: 0, removed: 0 };
  for (const hunk of toolResult.structuredPatch ?? []) {
    for (const line of hunk.lines ?? []) {
      if (line.startsWith('+')) counts.added += 1;
      else if (line.startsWith('-')) counts.removed += 1;
    }
  }
  if (counts.added + counts.removed > 0) return counts;
  // A written file without a patch: the whole content is new, the whole
  // original (if any) is gone.
  if (typeof toolResult.content === 'string' && toolResult.filePath) {
    return { added: lineCount(toolResult.content), removed: lineCount(toolResult.originalFile) };
  }
  return counts;
}

function applyEntry(session, entry) {
  if (typeof entry.timestamp === 'string') {
    if (session.started === null || entry.timestamp < session.started) session.started = entry.timestamp;
    if (session.updated === null || entry.timestamp > session.updated) session.updated = entry.timestamp;
  }
  if (entry.attributionSkill === RIGHT_SIZING_SKILL) session.rightSized = true;
  const message = entry.message;
  if (entry.type === 'assistant' && message && message.id && message.usage) {
    // One response is one line per content block, and a streaming response
    // repeats its id with a growing output count: the last line per id wins.
    session.usageById[message.id] = usageCounts(message.usage);
    // A delegate runs on its own model; the session's model is the main transcript's.
    if (typeof message.model === 'string' && entry.isSidechain !== true) session.model = message.model;
  }
  const toolResult = entry.toolUseResult;
  if (entry.type === 'user' && toolResult && typeof toolResult === 'object' && typeof entry.uuid === 'string') {
    const counts = patchedLines(toolResult);
    if (counts.added + counts.removed > 0) session.linesByEntry[entry.uuid] = counts;
  }
}

function sumTokens(session) {
  const totals = { input: 0, cacheRead: 0, cache5m: 0, cache1h: 0, output: 0 };
  for (const counts of Object.values(session.usageById)) {
    for (const key of Object.keys(totals)) totals[key] += counts[key];
  }
  totals.raw = totals.input + totals.cacheRead + totals.cache5m + totals.cache1h + totals.output;
  totals.weightedInput = totals.input
    + totals.cacheRead * CACHE_READ_RATE
    + totals.cache5m * CACHE_5M_RATE
    + totals.cache1h * CACHE_1H_RATE;
  return totals;
}

function sumLines(session) {
  const totals = { added: 0, removed: 0 };
  for (const counts of Object.values(session.linesByEntry)) {
    totals.added += counts.added;
    totals.removed += counts.removed;
  }
  return totals;
}

// Returns true when any transcript file had new complete lines.
function ingestTranscript(session, transcriptPath) {
  if (typeof transcriptPath !== 'string' || !fs.existsSync(transcriptPath)) return false;
  let changed = false;
  for (const file of transcriptFiles(transcriptPath)) {
    const { lines, offset } = appendedLines(file, session.offsets[file] ?? 0);
    for (const line of lines) {
      let entry;
      try {
        entry = JSON.parse(line);
      } catch {
        continue;
      }
      if (entry && typeof entry === 'object') applyEntry(session, entry);
    }
    if (lines.length > 0) changed = true;
    session.offsets[file] = offset;
  }
  if (changed) {
    session.tokens = sumTokens(session);
    session.lines = sumLines(session);
  }
  return changed;
}

function sessionMetrics(session) {
  const tokens = session.tokens ?? sumTokens({ usageById: session.usageById ?? {} });
  const lines = session.lines ?? sumLines({ linesByEntry: session.linesByEntry ?? {} });
  const elapsed = session.started && session.updated ? Date.parse(session.updated) - Date.parse(session.started) : 0;
  const guard = session.guard ?? { capped: 0, duplicates: 0, bytesWithheld: 0 };
  return {
    lines: lines.added,
    linesRemoved: lines.removed,
    tokens: tokens.weightedInput + tokens.output,
    cost: session.costUsd ?? null,
    time: session.durationMs ?? elapsed,
    rightSized: session.rightSized === true,
    guard
  };
}

function totals(sessions, include = () => true) {
  const sum = {
    sessions: 0, lines: 0, linesRemoved: 0, tokens: 0, cost: 0, costKnown: false, time: 0,
    guard: { capped: 0, duplicates: 0, bytesWithheld: 0 }
  };
  for (const session of Object.values(sessions)) {
    const metrics = sessionMetrics(session);
    if (!include(metrics)) continue;
    sum.sessions += 1;
    sum.lines += metrics.lines;
    sum.linesRemoved += metrics.linesRemoved;
    sum.tokens += metrics.tokens;
    sum.time += metrics.time;
    if (typeof metrics.cost === 'number') {
      sum.cost += metrics.cost;
      sum.costKnown = true;
    }
    for (const key of Object.keys(sum.guard)) sum.guard[key] += metrics.guard[key] ?? 0;
  }
  return sum;
}

// A metric cut by ratio r leaves (1 - r) of its baseline, so the baseline is
// actual / (1 - r) and the saving is the difference: actual × r / (1 - r).
function estimatedSavings(actual, ratios) {
  const saved = {};
  for (const metric of METRICS) {
    const ratio = ratios[metric] ?? 0;
    saved[metric] = actual[metric] * ratio / (1 - ratio);
  }
  return saved;
}

function compact(value) {
  if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e4) return `${Math.round(value / 1e3)}k`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(1)}k`;
  return `${Math.round(value)}`;
}

function duration(milliseconds) {
  const minutes = Math.round(milliseconds / 60000);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, '0')}`;
}

function money(value, known) {
  return known ? `$${value.toFixed(2)}` : '-';
}

function guardTokens(guard) {
  return compact(guard.bytesWithheld / BYTES_PER_TOKEN);
}

function segment(saved, costKnown, guard) {
  const ladder = `saved ≈ ${compact(saved.lines)} LOC · ${compact(saved.tokens)} tok · ${money(saved.cost, costKnown)} · ${duration(saved.time)}`;
  return guard.bytesWithheld > 0 ? `${ladder} · guard ≈ ${guardTokens(guard)} tok` : ladder;
}

function readStdin() {
  return JSON.parse(fs.readFileSync(0, 'utf8'));
}

function record(hookInput) {
  if (typeof hookInput.session_id !== 'string') return;
  updateSession(hookInput.session_id, (session) => ingestTranscript(session, hookInput.transcript_path));
}

function statusline(statusInput) {
  const config = loadConfig();
  let sessions = readJson(ledgerFile(), {});
  if (typeof statusInput.session_id === 'string') {
    sessions = updateSession(statusInput.session_id, (session) => {
      let changed = ingestTranscript(session, statusInput.transcript_path);
      const cost = statusInput.cost ?? {};
      if (typeof cost.total_cost_usd === 'number' && cost.total_cost_usd !== session.costUsd) {
        session.costUsd = cost.total_cost_usd;
        changed = true;
      }
      if (typeof cost.total_duration_ms === 'number' && cost.total_duration_ms !== session.durationMs) {
        session.durationMs = cost.total_duration_ms;
        changed = true;
      }
      return changed;
    });
  }
  const rightSized = totals(sessions, (metrics) => metrics.rightSized);
  const all = totals(sessions);
  process.stdout.write(segment(estimatedSavings(rightSized, config.ratios), rightSized.costKnown, all.guard));
}

function formatRow(cells, widths) {
  return cells.map((cell, index) => cell.padEnd(widths[index])).join('  ').trimEnd();
}

function report() {
  const config = loadConfig();
  const sessions = readJson(ledgerFile(), {});
  const all = totals(sessions);
  const rightSized = totals(sessions, (metrics) => metrics.rightSized);
  const saved = estimatedSavings(rightSized, config.ratios);
  const rows = [
    ['', 'LOC added', 'tokens', 'cost', 'time'],
    [`all sessions (${all.sessions})`, compact(all.lines), compact(all.tokens), money(all.cost, all.costKnown), duration(all.time)],
    [`right-sized sessions (${rightSized.sessions})`, compact(rightSized.lines), compact(rightSized.tokens), money(rightSized.cost, rightSized.costKnown), duration(rightSized.time)],
    ['estimated saved', compact(saved.lines), compact(saved.tokens), money(saved.cost, rightSized.costKnown), duration(saved.time)]
  ];
  const widths = rows[0].map((_, column) => Math.max(...rows.map((row) => row[column].length)));
  const lines = rows.map((row) => formatRow(row, widths));
  lines.push('');
  lines.push(`Read guard (measured): ${all.guard.capped} unbounded reads capped, ${all.guard.duplicates} unchanged re-reads refused, ≈ ${guardTokens(all.guard)} tok withheld (bytes / ${BYTES_PER_TOKEN}).`);
  lines.push('tokens = input + 0.1 × cache read + 1.25 × 5-minute cache write + 2 × 1-hour cache write + output.');
  lines.push(`Estimate: actual × r / (1 − r) over right-sized sessions, r = ${JSON.stringify(config.ratios)} (ponytail agentic benchmark); edit ${path.join(ledgerDirectory(), 'config.json')} to change r.`);
  if (!all.costKnown) lines.push('cost is recorded by the status line segment only; wire it to fill this column.');
  lines.push(`Ledger: ${ledgerFile()}`);
  process.stdout.write(`${lines.join('\n')}\n`);
}

const command = process.argv[2];
if (command === 'record' || command === 'statusline') {
  try {
    if (command === 'record') record(readStdin());
    else statusline(readStdin());
  } catch (error) {
    // A ledger fault must never block a turn or blank the status line.
    console.error(`savings: ${error.message}`);
  }
} else if (command === 'report') {
  try {
    report();
  } catch (error) {
    // report is a direct CLI command: its caller needs the failure surfaced.
    console.error(`savings: ${error.message}`);
    process.exit(1);
  }
} else {
  console.error('usage: savings.mjs record|statusline|report');
  process.exit(1);
}

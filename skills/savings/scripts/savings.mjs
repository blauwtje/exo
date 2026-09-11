#!/usr/bin/env node
// Savings: lines, tokens, cost and time per session, read from the transcript
// the harness writes and from the status line it renders, plus two saving
// figures: the bytes the read guard withheld (measured) and what the
// right-sizing ladder saved against the benchmark ratios in ratios.mjs
// (estimated).
//
//   node savings.mjs record      Stop hook: stdin is the hook JSON
//   node savings.mjs statusline  status line: stdin is the status JSON; prints one segment
//   node savings.mjs report      prints the totals as markdown
//   node savings.mjs status      prints on or off
//   node savings.mjs off | on    writes "enabled" into config.json: one switch for
//                                the ladder, the counter, the status line and the guard
//
// The transcript format is internal to the harness and may change between
// releases; a line that does not parse is skipped, never fatal, and a hook
// failure never blocks the turn.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { configFile, ledgerFile, readJson, savingsEnabled, updateSession, writeJson } from './ledger.mjs';
import PRICES from './prices.mjs';
import MEASURED from './ratios.mjs';
import { sumCounts, usageCounts } from './token-weights.mjs';

const BYTES_PER_TOKEN = 4;
const TOKENS_PER_PRICE_UNIT = 1e6;
const DAY_MS = 24 * 60 * 60 * 1000;
const TREND_DAYS = 30;
const TREND_LEVELS = '▂▃▄▅▆▇█';
const PANEL_ROWS = ['cost at API price', 'lines', 'tokens', 'time', 'last 30 days'];
const PROJECT_NAME_MAX = 28;
const RIGHT_SIZING_SKILL = 'exo:right-sizing';
const METRICS = ['lines', 'tokens', 'cost', 'time'];
// MEASURED is the cut per metric the benchmark measured against a no-skill
// baseline, with its source; user-editable in config.json.
const DEFAULT_CONFIG = {
  enabled: true,
  readGuard: true,
  ratios: { lines: MEASURED.lines, tokens: MEASURED.tokens, cost: MEASURED.cost, time: MEASURED.time }
};

function loadConfig() {
  const existing = readJson(configFile(), null);
  // A config that sets only readGuard or enabled keeps the default ratios.
  if (existing !== null) return { ...DEFAULT_CONFIG, ...existing, ratios: { ...DEFAULT_CONFIG.ratios, ...existing.ratios } };
  writeJson(configFile(), DEFAULT_CONFIG);
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
    // The model rides along because a delegate is priced at its own rate.
    session.usageById[message.id] = { ...usageCounts(message.usage), model: message.model };
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
  return sumCounts(Object.values(session.usageById));
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

function modelPrice(model) {
  if (typeof model !== 'string') return null;
  let family = null;
  for (const candidate of Object.keys(PRICES.models)) {
    if (model.startsWith(candidate) && (family === null || candidate.length > family.length)) family = candidate;
  }
  return family === null ? null : PRICES.models[family];
}

// A message on an unlisted model adds nothing, so such a session reads low;
// it reads null only when no message was priced. A row recorded before the
// model rode along with its usage is priced at the session's model.
function pricedCost(session) {
  let cost = null;
  for (const counts of Object.values(session.usageById ?? {})) {
    const price = modelPrice(counts.model ?? session.model);
    if (price === null) continue;
    let perMillion = 0;
    for (const key of Object.keys(price)) perMillion += (counts[key] ?? 0) * price[key];
    cost = (cost ?? 0) + perMillion / TOKENS_PER_PRICE_UNIT;
  }
  return cost;
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
    cost: session.costUsd ?? pricedCost(session),
    time: session.durationMs ?? elapsed,
    rightSized: session.rightSized === true,
    project: session.project ?? null,
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

// The project root a session first reports is its project; a later cd inside
// the session does not move it.
function claimProject(session, directory) {
  if (session.project !== null || typeof directory !== 'string') return false;
  session.project = directory;
  return true;
}

function record(hookInput) {
  if (!savingsEnabled()) return;
  if (typeof hookInput.session_id !== 'string') return;
  updateSession(hookInput.session_id, (session) => {
    const claimed = claimProject(session, process.env.CLAUDE_PROJECT_DIR || hookInput.cwd);
    const ingested = ingestTranscript(session, hookInput.transcript_path);
    return claimed || ingested;
  });
}

function statusline(statusInput) {
  if (!savingsEnabled()) return;
  const config = loadConfig();
  let sessions = readJson(ledgerFile(), {});
  if (typeof statusInput.session_id === 'string') {
    sessions = updateSession(statusInput.session_id, (session) => {
      let changed = ingestTranscript(session, statusInput.transcript_path);
      if (claimProject(session, statusInput.workspace?.project_dir ?? statusInput.cwd)) changed = true;
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

function status() {
  process.stdout.write(`${savingsEnabled() ? 'on' : 'off'}\n`);
}

function setEnabled(enabled) {
  const config = { ...loadConfig(), enabled };
  writeJson(configFile(), config);
  process.stdout.write(`exo savings ${enabled ? 'on' : 'off'}; right-sizing follows at the next session start\n`);
}

// A recorded project may be a symlinked path while process.cwd() is resolved;
// a project directory that no longer exists compares as recorded.
function resolvedPath(directory) {
  try {
    return fs.realpathSync(directory);
  } catch {
    return directory;
  }
}

// The recorded project that holds the directory, the deepest when projects
// nest, so a report run from a subdirectory still finds its project.
function currentProject(sessions, directory) {
  let match = null;
  for (const session of Object.values(sessions)) {
    const project = session.project;
    if (typeof project !== 'string') continue;
    const resolved = resolvedPath(project);
    const inside = directory === resolved || directory.startsWith(`${resolved}${path.sep}`);
    if (inside && (match === null || project.length > match.length)) match = project;
  }
  return match ?? directory;
}

// One table column: the estimated saving over the scope's right-sized sessions,
// in the order of PANEL_ROWS.
function scopeColumn(title, sessions, ratios, include) {
  const all = totals(sessions, include);
  const rightSized = totals(sessions, (metrics) => include(metrics) && metrics.rightSized);
  const saved = estimatedSavings(rightSized, ratios);
  const costKnown = rightSized.costKnown || rightSized.sessions === 0;
  const trend = trendLine(dailySavings(sessions, ratios, Date.now(), include));
  return {
    title,
    cells: [money(saved.cost, costKnown), compact(saved.lines), compact(saved.tokens), duration(saved.time), `\`${trend}\``],
    counted: `${rightSized.sessions} of ${all.sessions}`
  };
}

// The estimated cost saving per local day, oldest first, ending today.
function dailySavings(sessions, ratios, now, include) {
  const days = new Array(TREND_DAYS).fill(0);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  for (const session of Object.values(sessions)) {
    const metrics = sessionMetrics(session);
    if (!include(metrics) || !metrics.rightSized) continue;
    if (typeof metrics.cost !== 'number' || typeof session.started !== 'string') continue;
    const day = new Date(session.started);
    day.setHours(0, 0, 0, 0);
    // Rounded, because a day across a daylight-saving change is 23 or 25 hours.
    const age = Math.round((today - day) / DAY_MS);
    if (age < 0 || age >= TREND_DAYS) continue;
    days[TREND_DAYS - 1 - age] += estimatedSavings(metrics, ratios).cost;
  }
  return days;
}

// A day without a saving sits on the floor glyph; any saving rises above it.
function trendLine(days) {
  const peak = Math.max(...days);
  return days.map((value) => {
    if (value <= 0) return '▁';
    const level = Math.ceil((value / peak) * TREND_LEVELS.length) - 1;
    return TREND_LEVELS[level];
  }).join('');
}

// Markdown, not a drawn box: the model relays it unfenced, so Claude Code's own
// renderer styles the title, the table and the inline code.
function report() {
  const config = loadConfig();
  const sessions = readJson(ledgerFile(), {});
  const project = currentProject(sessions, process.cwd());
  const baseName = path.basename(project);
  const shortName = baseName.length > PROJECT_NAME_MAX ? `${baseName.slice(0, PROJECT_NAME_MAX - 1)}…` : baseName;
  // A pipe in a directory name would end the table cell.
  const projectName = shortName.replaceAll('|', '\\|');
  const inProject = (metrics) => metrics.project === project;
  const here = scopeColumn(`this project · ${projectName}`, sessions, config.ratios, inProject);
  const everywhere = scopeColumn('all projects', sessions, config.ratios, () => true);
  const enabled = savingsEnabled();
  const state = enabled ? '● on · turn off with `/exo:savings off`' : '○ off · turn on with `/exo:savings on`';
  const guard = totals(sessions).guard;
  const guardLabel = config.readGuard === false ? 'read guard (off in config.json)' : 'read guard';
  const ratios = METRICS.map((metric) => `${metric} ${config.ratios[metric]}`).join(' · ');
  const rows = PANEL_ROWS.map((label, index) => `| ${label} | ${here.cells[index]} | ${everywhere.cells[index]} |`);
  const lines = [
    `**✻ exo savings** · ${state}`,
    '',
    `| saved | ${here.title} | ${everywhere.title} |`,
    '|:--|--:|--:|',
    ...rows,
    '',
    `- ≈ estimated over right-sized sessions: ${here.counted} here, ${everywhere.counted} in all projects, r = ${ratios}`,
    `- ${guardLabel}, measured: ≈ ${guardTokens(guard)} tokens withheld · ${guard.capped} reads capped · ${guard.duplicates} re-reads refused`
  ];
  const override = process.env.EXO_SAVINGS;
  if (override === 'on' || override === 'off') lines.push(`- EXO_SAVINGS=${override} in the environment outranks the switch`);
  process.stdout.write(`${lines.join('\n')}\n`);
}

const command = process.argv[2];
const HOOK_COMMANDS = { record, statusline };
const CLI_COMMANDS = { report, status, on: () => setEnabled(true), off: () => setEnabled(false) };
if (command in HOOK_COMMANDS) {
  try {
    HOOK_COMMANDS[command](readStdin());
  } catch (error) {
    // A ledger fault must never block a turn or blank the status line.
    console.error(`savings: ${error.message}`);
  }
} else if (command in CLI_COMMANDS) {
  try {
    CLI_COMMANDS[command]();
  } catch (error) {
    // A CLI command's caller needs the failure surfaced.
    console.error(`savings: ${error.message}`);
    process.exit(1);
  }
} else {
  console.error('usage: savings.mjs record|statusline|report|status|on|off');
  process.exit(1);
}

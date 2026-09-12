#!/usr/bin/env node
// Savings: what exo saved per session in lines, tokens, cost and time, an
// estimate against the benchmark ratios in ratios.mjs, net of exo's own
// overhead. The ledger is fed from the transcript the harness writes
// (transcript.mjs) and from the status line it renders.
//
//   node savings.mjs record      Stop hook: stdin is the hook JSON
//   node savings.mjs statusline  status line: stdin is the status JSON; prints one segment
//   node savings.mjs report      prints the panel as a fenced fixed-width grid
//   node savings.mjs status      prints on or off
//   node savings.mjs off | on    writes "enabled" into config.json: one switch for
//                                the counter, the status line and the read guard
//
// A hook failure never blocks the turn.

import fs from 'node:fs';
import process from 'node:process';
import { configFile, ledgerFile, readJson, savingsEnabled, updateSession, writeJson } from './ledger.mjs';
import { overheadTotals } from './overhead.mjs';
import { countsCost } from './pricing.mjs';
import MEASURED from './ratios.mjs';
import { ingestTranscript, refreshStaleSessions, sumLines, sumTokens } from './transcript.mjs';

const PANEL_ROWS = {
  lines: 'code lines',
  tokens: 'tokens',
  cost: 'cost',
  time: 'time'
};
const COLUMN_GAP = 2;
// MEASURED is the cut per metric exo's benchmark measured against a no-skill
// baseline, with its source; a ratio in config.json overrides it.
const PUBLISHED_RATIOS = { lines: MEASURED.lines, tokens: MEASURED.tokens, cost: MEASURED.cost, time: MEASURED.time };
// 0.1.x wrote these ratios into config.json on first load and on every
// switch, so a stored ratio still equal to its value here carries no edit of
// the user's.
const FIRST_LOAD_RATIOS = { lines: 0.54, tokens: 0.22, cost: 0.2, time: 0.27 };
const DEFAULT_CONFIG = { enabled: true, readGuard: true };

function loadConfig() {
  const existing = readJson(configFile(), null);
  if (existing === null) {
    writeJson(configFile(), DEFAULT_CONFIG);
    return { ...DEFAULT_CONFIG, ratios: PUBLISHED_RATIOS };
  }
  const stored = Object.entries(existing.ratios ?? {});
  const edited = Object.fromEntries(stored.filter(([metric, ratio]) => ratio !== FIRST_LOAD_RATIOS[metric]));
  return { ...DEFAULT_CONFIG, ...existing, ratios: { ...PUBLISHED_RATIOS, ...edited } };
}

// A session's gross cost priced from its usage, each call at its own model,
// or null when a call's model has no price. A session with no recorded call
// cost nothing, which is a known zero: an unknown cost would take the whole
// scope's cost column down with it. A row recorded before the model rode
// along with its usage is priced at the session's model.
function pricedCost(session) {
  const rows = Object.values(session.usageById ?? {});
  let cost = 0;
  for (const counts of rows) {
    const rowCost = countsCost(counts, counts.model ?? session.model);
    if (rowCost === null) return null;
    cost += rowCost;
  }
  return cost;
}

function sessionMetrics(session) {
  const tokens = session.tokens ?? sumTokens({ usageById: session.usageById ?? {} });
  const lines = session.lines ?? sumLines({ linesByEntry: session.linesByEntry ?? {} });
  const elapsed = session.started && session.updated ? Date.parse(session.updated) - Date.parse(session.started) : 0;
  const overhead = overheadTotals(session);
  return {
    lines: lines.added,
    tokens: tokens.weightedInput + tokens.output,
    cost: session.costUsd ?? pricedCost(session),
    time: session.durationMs ?? elapsed,
    overhead: { tokens: overhead.tokens, cost: overhead.cost, time: overhead.time }
  };
}

// A session that wrote product code is what the benchmark measured: exo's
// ratios compare its exo arm, which paid exo's overhead, with a no-skill
// baseline, so it saves actual × r / (1 − r) and nothing more comes off. Any
// other session is outside every ratio and saves minus its overhead in
// tokens, cost and time. Lines are the code estimate alone: the lines exo's
// own process writes stay out of the product count that the ratio multiplies
// and are charged against nothing, because a markdown line of a brief is not
// a line of code. Cost is null when a price it needs is unknown.
function sessionSavings(metrics, ratios) {
  const estimate = (metric) => metrics[metric] * ratios[metric] / (1 - ratios[metric]);
  if (metrics.lines > 0) {
    return { lines: estimate('lines'), tokens: estimate('tokens'), cost: metrics.cost === null ? null : estimate('cost'), time: estimate('time') };
  }
  const overhead = metrics.overhead;
  return { lines: 0, tokens: -overhead.tokens, cost: overhead.cost === null ? null : -overhead.cost, time: -overhead.time };
}

function emptyTotals() {
  return { lines: 0, tokens: 0, cost: 0, costKnown: true, time: 0 };
}

function addTotals(total, values) {
  total.lines += values.lines;
  total.tokens += values.tokens;
  total.time += values.time;
  if (values.cost === null) total.costKnown = false;
  else total.cost += values.cost;
}

// Every session's saving summed, already net of what exo's own listing, skill
// bodies, hook runs and refusals cost that session. A cost is known only when
// every session's is.
function savedTotals(sessions, ratios) {
  const saved = emptyTotals();
  for (const session of Object.values(sessions)) {
    addTotals(saved, sessionSavings(sessionMetrics(session), ratios));
  }
  return saved;
}

function compact(value) {
  // A value that rounds to zero prints 0, never -0.
  if (Math.round(value) < 0) return `-${compact(-value)}`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e4) return `${Math.round(value / 1e3)}k`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(1)}k`;
  return `${Math.round(value)}`;
}

function duration(milliseconds) {
  const minutes = Math.round(milliseconds / 60000);
  if (minutes < 0) return `-${duration(-milliseconds)}`;
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, '0')}`;
}

// A loss prints its minus before the currency sign; a value that rounds to zero prints $0.00.
function money(value, known) {
  if (!known) return '-';
  if (Math.round(value * 100) < 0) return `-$${(-value).toFixed(2)}`;
  return `$${Math.abs(value).toFixed(2)}`;
}

function segment(saved) {
  return `saved ≈ ${compact(saved.lines)} LOC · ${compact(saved.tokens)} tok · ${money(saved.cost, saved.costKnown)} · ${duration(saved.time)}`;
}

function readStdin() {
  return JSON.parse(fs.readFileSync(0, 'utf8'));
}

function record(hookInput) {
  if (!savingsEnabled()) return;
  if (typeof hookInput.session_id !== 'string') return;
  updateSession(hookInput.session_id, (session) => ingestTranscript(session, hookInput.transcript_path));
}

function statusline(statusInput) {
  if (!savingsEnabled()) return;
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
  const saved = savedTotals(refreshStaleSessions(sessions), config.ratios);
  process.stdout.write(segment(saved));
}

function status() {
  process.stdout.write(`${savingsEnabled() ? 'on' : 'off'}\n`);
}

// Only "enabled" is written, so the published ratios keep reaching this install.
function setEnabled(enabled) {
  writeJson(configFile(), { ...readJson(configFile(), DEFAULT_CONFIG), enabled });
  process.stdout.write(`exo savings ${enabled ? 'on' : 'off'}; the counter, the status line segment and the read guard follow at once\n`);
}

// Code points, not terminal cells: the grid pads metric labels and formatted
// numbers only, all single width, so a code point count is the cell's width.
function displayWidth(text) {
  return [...text].length;
}

function padStart(text, width) {
  return ' '.repeat(Math.max(width - displayWidth(text), 0)) + text;
}

function padEnd(text, width) {
  return text + ' '.repeat(Math.max(width - displayWidth(text), 0));
}

// The panel's cells as text: per metric what the benchmark says exo saved
// against a no-skill baseline. A saving whose price is unknown, because a
// session's model is missing from prices.mjs, prints a dash.
function panelCells(sessions, ratios) {
  const saved = savedTotals(sessions, ratios);
  return {
    lines: compact(saved.lines),
    tokens: compact(saved.tokens),
    cost: money(saved.cost, saved.costKnown),
    time: duration(saved.time)
  };
}

// The grid: one row per metric, its label then its value. Both columns are
// padded from the width of their widest cell, so no cell can push a row past
// the edge.
function gridLines(cells) {
  const metrics = Object.keys(PANEL_ROWS);
  const labelWidth = Math.max(...Object.values(PANEL_ROWS).map(displayWidth));
  const valueWidth = Math.max(...metrics.map((metric) => displayWidth(cells[metric])));
  return metrics.map((metric) => padEnd(PANEL_ROWS[metric], labelWidth) + padStart(cells[metric], valueWidth + COLUMN_GAP));
}

// A fixed-width grid inside a code fence, because its columns line up only in
// a monospace block. Every session in the ledger, whatever project it ran in:
// one switch away from a per-project split that nobody read. No bar and no
// trend: one benchmark ratio per metric fills every bar to the same point,
// and a sparkline answers a question nobody asked.
function report() {
  const config = loadConfig();
  const sessions = refreshStaleSessions(readJson(ledgerFile(), {}));
  const cells = panelCells(sessions, config.ratios);
  const enabled = savingsEnabled();
  const lines = [
    '```text',
    `✻ exo savings · ${enabled ? '● on' : '○ off'} · all projects`,
    '',
    ...gridLines(cells),
    '```',
    '',
    enabled ? 'Turn off with `/exo:savings off`.' : 'Turn on with `/exo:savings on`.'
  ];
  const override = process.env.EXO_SAVINGS;
  if (override === 'on' || override === 'off') lines.push('', `EXO_SAVINGS=${override} in the environment outranks the switch.`);
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

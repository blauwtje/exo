#!/usr/bin/env node
// The exo ledger: what exo itself cost a session in tokens, price and wall
// time, and what its read guard kept out of context, summed over every session
// the ledger holds. Every figure is one the harness reported; nothing here is
// an estimate. The ledger is fed from the transcript the harness writes
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
import { measuredTotals } from './overhead.mjs';
import { ingestTranscript, refreshStaleSessions } from './transcript.mjs';

const PANEL_ROWS = {
  refusals: 'reads refused',
  bytesWithheld: 'context withheld',
  calls: 'exo calls',
  tokens: 'exo tokens',
  cost: 'exo cost',
  time: 'exo time'
};
const COLUMN_GAP = 2;
const DEFAULT_CONFIG = { enabled: true, readGuard: true };

function emptyTotals() {
  return { calls: 0, tokens: 0, cost: 0, costKnown: true, time: 0, refusals: 0, bytesWithheld: 0 };
}

// Every session's measured figures summed: what exo cost, and what the guard
// withheld. A cost is known only when every session's is.
function measuredLedger(sessions) {
  const totals = emptyTotals();
  for (const session of Object.values(sessions)) {
    const measured = measuredTotals(session);
    totals.calls += measured.calls;
    totals.tokens += measured.tokens;
    totals.time += measured.time;
    totals.refusals += measured.refusals;
    totals.bytesWithheld += measured.bytesWithheld;
    if (measured.costKnown) totals.cost += measured.cost;
    else totals.costKnown = false;
  }
  return totals;
}

function compact(value) {
  // A value that rounds to zero prints 0, never -0.
  if (Math.round(value) < 0) return `-${compact(-value)}`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e4) return `${Math.round(value / 1e3)}k`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(1)}k`;
  return `${Math.round(value)}`;
}

const BYTES_PER_KB = 1024;

// Binary units, because what the guard withheld is a file's own size.
function bytes(value) {
  if (value >= BYTES_PER_KB ** 2) return `${(value / BYTES_PER_KB ** 2).toFixed(1)} MB`;
  if (value >= BYTES_PER_KB) return `${Math.round(value / BYTES_PER_KB)} KB`;
  return `${Math.round(value)} B`;
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

function segment(measured) {
  return `exo ${bytes(measured.bytesWithheld)} withheld · ${compact(measured.tokens)} tok · ${money(measured.cost, measured.costKnown)} · ${duration(measured.time)}`;
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
  process.stdout.write(segment(measuredLedger(refreshStaleSessions(sessions))));
}

function status() {
  process.stdout.write(`${savingsEnabled() ? 'on' : 'off'}\n`);
}

// Only "enabled" is written, so `readGuard` and any other key the user set by
// hand survive the switch.
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

// The panel's cells as text: what exo cost, and what its guard held back. The
// cost prints a dash when a session's model is missing from prices.mjs.
function panelCells(sessions) {
  const measured = measuredLedger(sessions);
  return {
    refusals: compact(measured.refusals),
    bytesWithheld: bytes(measured.bytesWithheld),
    calls: compact(measured.calls),
    tokens: compact(measured.tokens),
    cost: money(measured.cost, measured.costKnown),
    time: duration(measured.time)
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
// trend: a measured figure needs no baseline drawn beside it.
function report() {
  const sessions = refreshStaleSessions(readJson(ledgerFile(), {}));
  const cells = panelCells(sessions);
  const enabled = savingsEnabled();
  const lines = [
    '```text',
    `✻ exo ledger · ${enabled ? '● on' : '○ off'} · all projects`,
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

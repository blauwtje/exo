#!/usr/bin/env node
// The savings counter: what exo itself cost in tokens, price and wall time,
// and what its read guard refused to send, summed over every session the
// counter holds. Every figure is one the harness reported; nothing here is an
// estimate. The counter is fed from the transcript the harness writes
// (transcript.mjs) and from the status line it renders.
//
//   node savings.mjs record            Stop hook: stdin is the hook JSON
//   node savings.mjs statusline        status line: stdin is the status JSON; prints one segment
//   node savings.mjs report            prints the cost report inside a text fence
//   node savings.mjs status            prints on or off
//   node savings.mjs off | on          writes "enabled" into config.json: one switch for
//                                      the counter, the status line and the read guard
//   node savings.mjs guard-lines <n>   writes "readGuardLines" into config.json: the line
//                                      count above which a whole-file read is refused
//   node savings.mjs guard [on|off]    prints the read guard's state and line limit, or
//                                      writes "readGuard" into config.json: the guard alone
//
// A hook failure never blocks the turn.

import fs from 'node:fs';
import process from 'node:process';
import {
  SESSION_RETENTION_DAYS, configFile, guardLines, readJson, readRecord, savingsEnabled, updateSession, writeJson
} from './record.mjs';
import { emptyTotals, measuredTotals } from './overhead.mjs';
import { ingestTranscript, refreshStaleSessions } from './transcript.mjs';

const DEFAULT_CONFIG = { enabled: true, readGuard: true };

// A cost is known only when every part of it is.
function addWork(target, source) {
  target.calls += source.calls;
  target.tokens += source.tokens;
  target.time += source.time;
  if (source.costKnown) target.cost += source.cost;
  else target.costKnown = false;
}

// Every session's measured figures summed, split the way measuredTotals splits them.
function measuredRecord(sessions) {
  const totals = emptyTotals();
  for (const session of Object.values(sessions)) {
    const measured = measuredTotals(session);
    addWork(totals, measured);
    totals.hookTime += measured.hookTime;
    totals.refusals += measured.refusals;
    totals.bytesWithheld += measured.bytesWithheld;
    for (const [kind, work] of Object.entries(measured.work)) addWork(totals.work[kind], work);
    for (const [kind, guard] of Object.entries(measured.guards)) {
      totals.guards[kind].refusals += guard.refusals;
      totals.guards[kind].bytesWithheld += guard.bytesWithheld;
    }
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

// A count and its noun, singular for exactly one.
function counted(value, noun) {
  const suffix = value === 1 ? '' : 's';
  return `${compact(value)} ${noun}${suffix}`;
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

// Where a session's context stands, by the tokens it holds and not by its share
// of the window: reading and reasoning decline with what the model carries, and
// a larger window only moves where it ends. Below the first band the segment
// names the count alone.
const CONTEXT_BANDS = [
  { from: 200_000, word: 'write a handoff, then clear' },
  { from: 150_000, word: 'dull, hand off soon' },
  { from: 100_000, word: 'edge' }
];

// The status input carries context_window.total_input_tokens, the input, cache
// read and cache write tokens of the latest response; it is absent or null
// until the first response, and the segment then says nothing about context.
function contextBand(statusInput) {
  const tokens = statusInput.context_window?.total_input_tokens;
  if (typeof tokens !== 'number') return '';
  const count = `${Math.round(tokens / 1000)}k`;
  const band = CONTEXT_BANDS.find((each) => tokens >= each.from);
  return band ? ` · context ${count} · ${band.word}` : ` · context ${count}`;
}

// Cost first, as in the report. Refusals are a count, never bytes, and the
// token total stays in the report's footer: beside a cost it gives a rate.
function segment(measured, statusInput) {
  return `exo cost ${money(measured.cost, measured.costKnown)} · ${duration(measured.time)} · ${counted(measured.refusals, 'read')} refused${contextBand(statusInput)}`;
}

function readStdin() {
  return JSON.parse(fs.readFileSync(0, 'utf8'));
}

function recordSession(hookInput) {
  if (!savingsEnabled()) return;
  if (typeof hookInput.session_id !== 'string') return;
  updateSession(hookInput.session_id, (session) => ingestTranscript(session, hookInput.transcript_path));
}

function statusline(statusInput) {
  if (!savingsEnabled()) return;
  let sessions = readRecord();
  if (typeof statusInput.session_id === 'string') {
    sessions = updateSession(statusInput.session_id, (session) => ingestTranscript(session, statusInput.transcript_path));
  }
  process.stdout.write(segment(measuredRecord(refreshStaleSessions(sessions)), statusInput));
}

function status() {
  process.stdout.write(`${savingsEnabled() ? 'on' : 'off'}\n`);
}

// EXO_SAVINGS in the environment outranks config.json, so every view of the
// switch names an override that holds it in place.
function overrideNotice() {
  const override = process.env.EXO_SAVINGS;
  if (override !== 'on' && override !== 'off') return null;
  return `EXO_SAVINGS=${override} in the environment outranks the switch.`;
}

// Only "enabled" is written, so `readGuard` and any other key the user set by
// hand survive the switch.
function setEnabled(enabled) {
  writeJson(configFile(), { ...readJson(configFile(), DEFAULT_CONFIG), enabled });
  process.stdout.write(`exo savings ${enabled ? 'on' : 'off'}; the counter, the status line segment and the read guard follow at once\n`);
  const notice = overrideNotice();
  if (notice !== null) process.stdout.write(`${notice}\n`);
}

// A whole number from 1 up; anything else is refused before config.json is
// written, because the guard would read it as the default.
function setGuardLines(argument) {
  const lineLimit = Number(argument);
  if (!/^\d+$/.test(argument ?? '') || !Number.isSafeInteger(lineLimit) || lineLimit < 1) {
    throw new Error(`guard-lines needs a whole number of at least 1, got ${argument ?? 'nothing'}`);
  }
  writeJson(configFile(), { ...readJson(configFile(), DEFAULT_CONFIG), readGuardLines: lineLimit });
  process.stdout.write(`exo read guard now refuses a whole-file read of a file over ${lineLimit} lines\n`);
}

// Without an argument, prints the guard's own switch and its line limit.
// Only "readGuard" is written, so "enabled" and "readGuardLines" survive the switch.
function setGuard(argument) {
  if (argument === undefined) {
    const guardOn = readJson(configFile(), {}).readGuard !== false;
    process.stdout.write(`read guard ${guardOn ? 'on' : 'off'}, ${guardLines()} lines\n`);
    return;
  }
  if (argument !== 'on' && argument !== 'off') {
    throw new Error(`guard needs on or off, got ${argument}`);
  }
  writeJson(configFile(), { ...readJson(configFile(), DEFAULT_CONFIG), readGuard: argument === 'on' });
  process.stdout.write(`exo read guard ${argument}\n`);
}

// Which skills fired and how many turns matched none, summed over every
// session the record holds.
function routingTotals(sessions) {
  const skills = {};
  let none = 0;
  for (const session of Object.values(sessions)) {
    const routing = session.routing ?? {};
    for (const [name, count] of Object.entries(routing.skills ?? {})) {
      skills[name] = (skills[name] ?? 0) + count;
    }
    none += routing.none ?? 0;
  }
  return { skills, none };
}

// At most five skills so the line stays one line; the rest are summed under
// "other", never dropped. `none` closes the line, because it is the count the
// line exists for.
const ROUTING_NAMES = 5;

function routingLine(totals) {
  const byCount = (first, second) => second[1] - first[1] || first[0].localeCompare(second[0]);
  const ranked = Object.entries(totals.skills).sort(byCount);
  const parts = [];
  for (const [name, count] of ranked.slice(0, ROUTING_NAMES)) parts.push(`${name} ${compact(count)}`);
  let rest = 0;
  for (const [, count] of ranked.slice(ROUTING_NAMES)) rest += count;
  if (rest > 0) parts.push(`other ${compact(rest)}`);
  parts.push(`none ${compact(totals.none)}`);
  return `Skills   ${parts.join(' · ')}`;
}

// Every session the counter holds, whatever project it ran in, in a fence so
// the labels line up. No saving and no net: the refused text was never sent,
// so nothing measured turns its bytes into tokens or money.
function report() {
  const sessions = refreshStaleSessions(readRecord());
  const measured = measuredRecord(sessions);
  const enabled = savingsEnabled();
  const sessionCount = Object.keys(sessions).length;
  const lines = [
    '```text',
    `exo savings · ${enabled ? 'on' : 'off'} · last ${SESSION_RETENTION_DAYS} days · ${counted(sessionCount, 'session')}`,
    `Cost     ${money(measured.cost, measured.costKnown)} · ${counted(measured.calls, 'call')} · ${duration(measured.time)}`,
    `Refused  ${counted(measured.refusals, 'read')} · ${bytes(measured.bytesWithheld)} of file text never sent`,
    'Saved    not measured: refused text has no token count or price',
    routingLine(routingTotals(sessions)),
    '```',
    enabled ? 'Turn off with `/exo:settings counter off`.' : 'Turn on with `/exo:settings counter on`.'
  ];
  const notice = overrideNotice();
  if (notice !== null) lines.push('', notice);
  process.stdout.write(`${lines.join('\n')}\n`);
}

const command = process.argv[2];
const HOOK_COMMANDS = { record: recordSession, statusline };
const CLI_COMMANDS = {
  report,
  status,
  on: () => setEnabled(true),
  off: () => setEnabled(false),
  'guard-lines': () => setGuardLines(process.argv[3]),
  guard: () => setGuard(process.argv[3])
};
if (command in HOOK_COMMANDS) {
  try {
    HOOK_COMMANDS[command](readStdin());
  } catch (error) {
    // A counter fault must never block a turn or blank the status line.
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
  console.error('usage: savings.mjs record|statusline|report|status|on|off|guard-lines <lines>|guard [on|off]');
  process.exit(1);
}

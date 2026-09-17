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
//
// A hook failure never blocks the turn.

import fs from 'node:fs';
import process from 'node:process';
import {
  SESSION_RETENTION_DAYS, configFile, guardLines, readJson, readLedger, savingsEnabled, updateSession, writeJson
} from './ledger.mjs';
import { GUARD_KINDS, emptyTotals, emptyWork, measuredTotals } from './overhead.mjs';
import { ingestTranscript, refreshStaleSessions } from './transcript.mjs';

const DEFAULT_CONFIG = { enabled: true, readGuard: true };
const BOX_WIDTH = 62;
const MECHANISM_WIDTH = 62;
const GUARD_LABELS = { capped: 'Big file', duplicate: 'Same lines again' };

// A cost is known only when every part of it is.
function addWork(target, source) {
  target.calls += source.calls;
  target.tokens += source.tokens;
  target.time += source.time;
  if (source.costKnown) target.cost += source.cost;
  else target.costKnown = false;
}

// Every session's measured figures summed, split the way measuredTotals splits them.
function measuredLedger(sessions) {
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

// Cost first, as in the report. Refusals are a count, never bytes, and the
// token total stays in the report's footer: beside a cost it gives a rate.
function segment(measured) {
  return `exo cost ${money(measured.cost, measured.costKnown)} · ${duration(measured.time)} · ${counted(measured.refusals, 'read')} refused`;
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
  let sessions = readLedger();
  if (typeof statusInput.session_id === 'string') {
    sessions = updateSession(statusInput.session_id, (session) => ingestTranscript(session, statusInput.transcript_path));
  }
  process.stdout.write(segment(measuredLedger(refreshStaleSessions(sessions))));
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

// Code points, not terminal cells: the report pads labels, box-drawing
// characters and formatted numbers only, all single width, so a code point
// count is the cell's width.
function displayWidth(text) {
  return [...text].length;
}

function padStart(text, width) {
  return ' '.repeat(Math.max(width - displayWidth(text), 0)) + text;
}

function padEnd(text, width) {
  return text + ' '.repeat(Math.max(width - displayWidth(text), 0));
}

function titleBoxLines(titleLines) {
  const inner = BOX_WIDTH - 2;
  const edge = '─'.repeat(inner);
  const boxed = (text) => `│${padEnd(`  ${text}`, inner)}│`;
  return [`┌${edge}┐`, boxed(''), ...titleLines.map(boxed), boxed(''), `└${edge}┘`];
}

// Cost is the headline and the refusals follow as a count with their file
// text. The refused text was never sent, so it has no token count or price,
// and the saving it stands for is not measured: the report says so flatly.
function headlineLines(measured) {
  const cost = money(measured.cost, measured.costKnown);
  const refused = counted(measured.refusals, 'read');
  const valueWidth = Math.max(displayWidth(cost), displayWidth(refused));
  return [
    `  exo cost   ${padEnd(cost, valueWidth)}  ${counted(measured.calls, 'call')} · ${duration(measured.time)}`,
    `  Refused    ${padEnd(refused, valueWidth)}  ${bytes(measured.bytesWithheld)} of file text never sent to Claude`,
    '',
    '  What exo saved is not measured. Refused text was never sent,',
    '  so no token count or price exists for it.'
  ];
}

// A fully ruled table: a rule between every row, the first column left-aligned
// and every other column right-aligned, each as wide as its widest cell.
function tableLines(header, rows) {
  const allRows = [header, ...rows];
  const widths = header.map((_, column) => Math.max(...allRows.map((row) => displayWidth(row[column]))));
  const rule = (left, middle, right) => left + widths.map((width) => '─'.repeat(width + 2)).join(middle) + right;
  const rowLine = (row) => {
    const cells = row.map((cell, column) => (column === 0 ? padEnd(cell, widths[column]) : padStart(cell, widths[column])));
    return `│ ${cells.join(' │ ')} │`;
  };
  const lines = [rule('┌', '┬', '┐')];
  for (const [index, row] of allRows.entries()) {
    if (index > 0) lines.push(rule('├', '┼', '┤'));
    lines.push(rowLine(row));
  }
  lines.push(rule('└', '┴', '┘'));
  return lines;
}

function rereadWork(measured) {
  const rereads = emptyWork();
  for (const kind of GUARD_KINDS) addWork(rereads, measured.work[kind]);
  return rereads;
}

// Each guard's refusals and refused file text beside the re-reads it caused and
// their cost: the trade a user weighs before changing the guard.
function guardTableLines(measured) {
  const rows = GUARD_KINDS.map((kind) => {
    const guard = measured.guards[kind];
    const work = measured.work[kind];
    return [GUARD_LABELS[kind], compact(guard.refusals), bytes(guard.bytesWithheld), compact(work.calls), money(work.cost, work.costKnown)];
  });
  const rereads = rereadWork(measured);
  rows.push(['Total', compact(measured.refusals), bytes(measured.bytesWithheld), compact(rereads.calls), money(rereads.cost, rereads.costKnown)]);
  return tableLines(['Guard', 'Refused', 'File text', 'Re-reads', 'Cost'], rows);
}

// No token column: a row with both tokens and cost gives a rate.
function costTableLines(measured) {
  const workRow = (label, work) => [label, compact(work.calls), duration(work.time), money(work.cost, work.costKnown)];
  const rows = [
    workRow('Loading exo skills', measured.work.skill),
    workRow('Re-reads after a refusal', rereadWork(measured)),
    ['exo hooks', '-', duration(measured.hookTime), '-'],
    workRow('Total', measured)
  ];
  return tableLines(['Work', 'Calls', 'Time', 'Cost'], rows);
}

// Every mechanism exo works by, with its measured figure or `not measured`,
// so the measured part never reads as the whole picture.
function mechanismLines(measured, lineLimit) {
  const guardFigure = (kind) => {
    const guard = measured.guards[kind];
    return `${compact(guard.refusals)} refused · ${bytes(guard.bytesWithheld)}`;
  };
  const mechanisms = [
    ['Big-file guard', guardFigure('capped'), [
      `Claude asked to read a file of over ${lineLimit} lines in one go.`,
      'exo said no and asked it to find the part it needs first.'
    ]],
    ['Repeat guard', guardFigure('duplicate'), [
      'Claude asked again for lines it had already read, and the',
      'file had not changed. exo said no: it still had that copy.'
    ]],
    ['Helpers', 'not measured', [
      'Searches and builds run in a helper, a second Claude with',
      'its own workspace, so their file dumps stay out of yours.'
    ]],
    ['Build only what is needed', 'not measured', [
      'Before writing code, exo checks whether it is needed or',
      'already exists, and then writes as little as works.'
    ]]
  ];
  const lines = ['What exo does, and what this report measures'];
  for (const [name, figure, description] of mechanisms) {
    const figureWidth = MECHANISM_WIDTH - 2 - displayWidth(name);
    lines.push('', `  ${name}${padStart(figure, figureWidth)}`);
    for (const text of description) lines.push(`    ${text}`);
  }
  return lines;
}

// What the user can switch to spend less, and the cost no switch reaches.
function tuningLines(measured, lineLimit) {
  const rereads = rereadWork(measured);
  const skills = measured.work.skill;
  return [
    `To spend less: re-reads after a refusal cost ${money(rereads.cost, rereads.costKnown)}.`,
    `To refuse fewer reads, raise the big-file limit of ${lineLimit}`,
    'lines with /exo:savings guard-lines <lines>.',
    `Loading skills cost ${money(skills.cost, skills.costKnown)} and has no switch; only`,
    'disabling the exo plugin stops it.'
  ];
}

// The one place the token total appears, on a line of its own, away from any
// cost and any refused text, so no line or row gives a price per token.
function footerLines(measured) {
  return [
    `Tokens: exo's calls came to ${compact(measured.tokens)} in all. Text read back from`,
    'the prompt cache counts a tenth, text written to it more.',
    'Cost: what these calls cost at API list price, not your bill.',
    "Time: the calls' wall time plus exo's hook runs.",
    'Not counted: the instructions exo adds when a session starts.'
  ];
}

// The report inside a code fence, because its tables line up only in a
// monospace block. Every session the counter holds, whatever project it ran
// in. No saving and no net: the refused text was never sent, so nothing
// measured turns its bytes into tokens or money.
function report() {
  const sessions = refreshStaleSessions(readLedger());
  const measured = measuredLedger(sessions);
  const enabled = savingsEnabled();
  const lineLimit = guardLines();
  const sessionCount = Object.keys(sessions).length;
  const lines = [
    '```text',
    ...titleBoxLines([
      `exo cost report · ${enabled ? 'on' : 'off'}`,
      `All projects, last ${SESSION_RETENTION_DAYS} days · ${counted(sessionCount, 'session')}`
    ]),
    '',
    ...headlineLines(measured),
    '',
    'What exo cost',
    ...costTableLines(measured),
    '',
    'What the read guard refused, and what its re-reads cost',
    ...guardTableLines(measured),
    '',
    ...mechanismLines(measured, lineLimit),
    '',
    ...tuningLines(measured, lineLimit),
    '',
    ...footerLines(measured),
    '```',
    '',
    enabled ? 'Turn off with `/exo:savings off`.' : 'Turn on with `/exo:savings on`.'
  ];
  const notice = overrideNotice();
  if (notice !== null) lines.push('', notice);
  process.stdout.write(`${lines.join('\n')}\n`);
}

const command = process.argv[2];
const HOOK_COMMANDS = { record, statusline };
const CLI_COMMANDS = {
  report,
  status,
  on: () => setEnabled(true),
  off: () => setEnabled(false),
  'guard-lines': () => setGuardLines(process.argv[3])
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
  console.error('usage: savings.mjs record|statusline|report|status|on|off|guard-lines <lines>');
  process.exit(1);
}

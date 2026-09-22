#!/usr/bin/env node
// The savings ledger: what exo's read guard kept out of context, summed over
// every session the counter holds and printed as an estimated token figure.
// The guard books the bytes of each refused read; the estimate divides them by
// CHARACTERS_PER_TOKEN when it prints, so the record stores no token figure
// and nothing here is measured or billed. The Stop hook still reads the
// transcript into the record (transcript.mjs), because the benchmark shares it.
//
//   node savings.mjs record            Stop hook: stdin is the hook JSON
//   node savings.mjs statusline        status line: prints one segment from the record; reads no stdin
//   node savings.mjs report            prints the savings report inside a text fence
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
import { GUARD_KINDS, measuredTotals } from './overhead.mjs';
import { ingestTranscript, refreshStaleSessions } from './transcript.mjs';

const DEFAULT_CONFIG = { enabled: true, readGuard: true };

// Anthropic's glossary puts one token at about 3.5 English characters. The
// guard booked bytes, not characters, so text outside ASCII overcounts slightly.
const CHARACTERS_PER_TOKEN = 3.5;

function estimatedTokens(bytesWithheld) {
  return bytesWithheld / CHARACTERS_PER_TOKEN;
}

// The read guard's refusals over every session: a count and the bytes they
// kept out of context, in total and by guard kind.
function withheldRecord(sessions) {
  const withheld = { refusals: 0, bytesWithheld: 0, guards: {} };
  for (const kind of GUARD_KINDS) withheld.guards[kind] = { refusals: 0, bytesWithheld: 0 };
  for (const session of Object.values(sessions)) {
    const measured = measuredTotals(session);
    withheld.refusals += measured.refusals;
    withheld.bytesWithheld += measured.bytesWithheld;
    for (const kind of GUARD_KINDS) {
      withheld.guards[kind].refusals += measured.guards[kind].refusals;
      withheld.guards[kind].bytesWithheld += measured.guards[kind].bytesWithheld;
    }
  }
  return withheld;
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

function segment(withheld) {
  return `exo ≈${compact(estimatedTokens(withheld.bytesWithheld))} tokens saved`;
}

const GUARD_LABELS = { capped: 'Big-file reads refused', duplicate: 'Repeated reads refused' };

// Every ledger label is padded to this width, so the ≈ figures line up in the fence.
const LEDGER_LABEL_WIDTH = 29;

function ledgerLine(label, bytesWithheld, suffix = '') {
  return `${label.padEnd(LEDGER_LABEL_WIDTH)}≈ ${compact(estimatedTokens(bytesWithheld))}${suffix}`;
}

// The lines inside the fence: one total, one indented line per read guard
// kind and the estimate's basis; while nothing was refused, one sentence,
// because a row of zeros reads as a measurement of nothing.
function ledgerLines(withheld) {
  if (withheld.refusals === 0) {
    return [`Nothing refused yet: keep the read guard on and ask again after a session reads a file over ${guardLines()} lines whole, or the same range twice.`];
  }
  const lines = [ledgerLine('Tokens kept out of context', withheld.bytesWithheld)];
  for (const kind of GUARD_KINDS) {
    const guard = withheld.guards[kind];
    lines.push(ledgerLine(`  ${GUARD_LABELS[kind]}`, guard.bytesWithheld, ` · ${counted(guard.refusals, 'read')}`));
  }
  lines.push('', `Estimated at ${CHARACTERS_PER_TOKEN} characters per token, the figure Anthropic documents; not measured or billed.`);
  return lines;
}

function readStdin() {
  return JSON.parse(fs.readFileSync(0, 'utf8'));
}

function recordSession(hookInput) {
  if (!savingsEnabled()) return;
  if (typeof hookInput.session_id !== 'string') return;
  updateSession(hookInput.session_id, (session) => ingestTranscript(session, hookInput.transcript_path));
}

// The record only: the Stop hook already read the transcript into it, and a
// render that read it again would pay that cost on every status line refresh.
function statusline() {
  if (!savingsEnabled()) return;
  process.stdout.write(segment(withheldRecord(readRecord())));
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

// Every session the counter holds, whatever project it ran in, in a fence so
// the figures line up. Only the read guard is counted: the repeat guard's
// denials carry no text to estimate from.
function report() {
  const sessions = refreshStaleSessions(readRecord());
  const withheld = withheldRecord(sessions);
  const enabled = savingsEnabled();
  const sessionCount = Object.keys(sessions).length;
  const lines = [
    '```text',
    'exo savings',
    `Last ${SESSION_RETENTION_DAYS} days · ${counted(sessionCount, 'session')} · local estimate`,
    '',
    ...ledgerLines(withheld),
    '```',
    enabled ? 'Turn off with `/exo:settings counter off`.' : 'Turn on with `/exo:settings counter on`.'
  ];
  const notice = overrideNotice();
  if (notice !== null) lines.push('', notice);
  process.stdout.write(`${lines.join('\n')}\n`);
}

const command = process.argv[2];
const HOOK_COMMANDS = { record: () => recordSession(readStdin()), statusline };
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
    HOOK_COMMANDS[command]();
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

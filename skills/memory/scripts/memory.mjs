// The project memory on disk: what this repository taught exo, attested in two
// distinct sessions and still true. memory.json is the state this script owns
// and memory.md the rendered file a session reads; the two are written together,
// so a reader never sees a claim the state has already retired.
//
//   node memory.mjs paths
//   node memory.mjs render
//
// Every command takes --cwd naming the repository, defaulting to the process
// working directory.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { Buffer } from 'node:buffer';
import { parseArgs } from 'node:util';
import { MEMORY_BUDGET } from '#budgets';
import { ATTESTATIONS_REQUIRED, appendNudgeLog, memoryDirectory } from '#memory-store';

function stateFile(cwd) {
  return path.join(memoryDirectory(cwd), 'memory.json');
}

function memoryFile(cwd) {
  return path.join(memoryDirectory(cwd), 'memory.md');
}

// A missing state is an empty one; any other read or parse failure throws,
// because a state written back without being read drops every line in it.
function readState(cwd) {
  let text;
  try {
    text = fs.readFileSync(stateFile(cwd), 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return { candidates: {}, lines: [] };
    throw error;
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(`${stateFile(cwd)} is not valid JSON: ${error.message}`);
  }
  return { candidates: parsed.candidates ?? {}, lines: parsed.lines ?? [] };
}

const HEADER = '# Project memory\n\nexo writes this file. Do not edit it by hand: run `/exo:memory` instead.';

// A line that left the understanding says so and stays: what exo once believed,
// and the day it stopped, exists nowhere else once this file is rewritten.
function decisionLine(line) {
  if (line.superseded !== null) return `- ${line.superseded.date} superseded by "${line.superseded.by}": ${line.claim}`;
  if (line.dropped !== null) return `- ${line.dropped.date} dropped, ${line.dropped.missing.join(', ')} no longer exist: ${line.claim}`;
  return `- ${line.written} ${line.claim}`;
}

// What a session reads and what the budget measures: the claims still live, then
// every decision with its date.
function render(state) {
  const live = state.lines.filter((line) => line.superseded === null && line.dropped === null);
  const understanding = live.length === 0
    ? `Nothing is attested in ${ATTESTATIONS_REQUIRED} sessions yet.`
    : live.map((line) => `- ${line.claim} (refs: ${line.refs.join(', ')})`).join('\n');
  const history = state.lines.length === 0
    ? 'Nothing has been written yet.'
    : state.lines.map(decisionLine).join('\n');
  return `${[HEADER, '## Current understanding', understanding, '## Decisions', history].join('\n\n')}\n`;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

// Both files are written together, so a reader never sees a claim the state has
// already retired.
function writeState(cwd, state) {
  fs.mkdirSync(memoryDirectory(cwd), { recursive: true });
  fs.writeFileSync(stateFile(cwd), `${JSON.stringify(state, null, 2)}\n`);
  fs.writeFileSync(memoryFile(cwd), render(state));
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

// A second booking from the same session replaces that session's quote rather
// than counting twice: a session that repeats itself has still seen the claim once.
function book(state, claim, quote, session) {
  const attestations = (state.candidates[claim] ?? []).filter((entry) => entry.session !== session);
  attestations.push({ session, date: today(), quote });
  state.candidates[claim] = attestations;
  return attestations.length;
}

function proposable(state) {
  return Object.entries(state.candidates)
    .filter(([, attestations]) => attestations.length >= ATTESTATIONS_REQUIRED)
    .map(([claim, attestations]) => ({ claim, attestations }));
}

// A ref names a file this repository still holds, optionally a symbol inside it
// as `<path>#<symbol>`. It is resolved against the root and rejected when it
// escapes: a ref is model-written text, and verify opens whatever it names.
function resolveRef(cwd, ref) {
  const [relative, symbol] = ref.split('#');
  const root = path.resolve(cwd);
  if (relative === '' || path.isAbsolute(relative)) throw new Error(`ref ${ref} is not a path inside the repository`);
  const target = path.resolve(root, relative);
  if (target !== root && !target.startsWith(root + path.sep)) throw new Error(`ref ${ref} is not a path inside the repository`);
  return { relative, symbol, target };
}

function parseRefs(cwd, refs) {
  const listed = (refs ?? '').split(',').map((ref) => ref.trim()).filter((ref) => ref !== '');
  for (const ref of listed) resolveRef(cwd, ref);
  return listed;
}

// The refusal names what has to go, oldest live line first, because a writer
// told only that it is over budget has to open the file to act on it.
function budgetRefusal(state, bytes) {
  const live = state.lines.filter((line) => line.superseded === null && line.dropped === null);
  const oldest = [...live].sort((left, right) => (left.written < right.written ? -1 : 1));
  const named = oldest.slice(0, 3).map((line) => `${line.written} ${line.claim}`);
  return `refused: memory.md would be ${bytes} bytes, over the ${MEMORY_BUDGET.bytes} byte budget. Retire one of these lines, oldest first, or archive the decision history: ${named.join('; ')}`;
}

// The write happens only after the user approved the proposal, which is why this
// runs as its own command rather than at the end of propose.
function writeClaim(cwd, state, claim, refs, replaces) {
  const attestations = state.candidates[claim] ?? [];
  if (attestations.length < ATTESTATIONS_REQUIRED) {
    throw new Error(`refused: "${claim}" is attested in ${attestations.length} session(s), and ${ATTESTATIONS_REQUIRED} are required`);
  }
  // One live line per claim: a claim two later sessions attest again is already
  // in the file, and a second copy of it costs every session the budget twice.
  const live = state.lines.find((line) => line.claim === claim && line.superseded === null && line.dropped === null);
  if (live !== undefined) {
    throw new Error(`refused: "${claim}" is already live, written ${live.written}. Supersede it with --replaces or retire it rather than writing it twice`);
  }
  const written = today();
  const next = { candidates: { ...state.candidates }, lines: state.lines.map((line) => ({ ...line })) };
  delete next.candidates[claim];
  if (replaces !== undefined) {
    const predecessor = next.lines.find((line) => line.claim === replaces && line.superseded === null && line.dropped === null);
    if (predecessor === undefined) throw new Error(`refused: no live line reads "${replaces}"`);
    predecessor.superseded = { date: written, by: claim };
  }
  next.lines.push({
    claim,
    refs,
    written,
    quotes: attestations.map((entry) => ({ date: entry.date, quote: entry.quote })),
    superseded: null,
    dropped: null
  });
  const bytes = Buffer.byteLength(render(next), 'utf8');
  if (bytes > MEMORY_BUDGET.bytes) throw new Error(budgetRefusal(next, bytes));
  writeState(cwd, next);
  return bytes;
}

// A live line stays live only while every path and symbol it names is still
// there. A line that fails is marked dropped and keeps its place in the history,
// never removed: the claim and the refs that killed it are the only record that
// exo ever believed it. A line already superseded or dropped is not re-checked.
function verifyLines(cwd, state) {
  const date = today();
  let checked = 0;
  const dropped = [];
  const lines = state.lines.map((line) => {
    if (line.superseded !== null || line.dropped !== null) return line;
    checked += 1;
    const missing = line.refs.filter((ref) => {
      const { symbol, target } = resolveRef(cwd, ref);
      if (!fs.existsSync(target)) return true;
      return symbol !== undefined && !fs.readFileSync(target, 'utf8').includes(symbol);
    });
    if (missing.length === 0) return line;
    dropped.push({ claim: line.claim, missing });
    return { ...line, dropped: { date, missing } };
  });
  return { lines, live: checked - dropped.length, dropped };
}

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    cwd: { type: 'string' },
    claim: { type: 'string' },
    quote: { type: 'string' },
    session: { type: 'string' },
    refs: { type: 'string' },
    replaces: { type: 'string' }
  }
});

const cwd = values.cwd ?? process.cwd();
const command = positionals[0];

if (command === 'paths') {
  console.log(stateFile(cwd));
  console.log(memoryFile(cwd));
} else if (command === 'render') {
  try {
    process.stdout.write(render(readState(cwd)));
  } catch (error) {
    fail(error.message);
  }
} else if (command === 'book') {
  if (values.claim === undefined || values.quote === undefined || values.session === undefined) {
    fail('book needs --claim, --quote and --session');
  }
  try {
    const state = readState(cwd);
    const attestations = book(state, values.claim, values.quote, values.session);
    writeState(cwd, state);
    // The nudge hook logs what it fired on; a booking logged here is the other
    // half of that measurement, and without it a hit rate cannot be read back.
    appendNudgeLog(cwd, { event: 'booked', session: values.session, claim: values.claim });
    console.log(`booked "${values.claim}": ${attestations} of ${ATTESTATIONS_REQUIRED} sessions`);
  } catch (error) {
    fail(error.message);
  }
} else if (command === 'propose') {
  try {
    const candidates = proposable(readState(cwd));
    if (candidates.length === 0) {
      console.log(`no claim is attested in ${ATTESTATIONS_REQUIRED} sessions yet`);
    }
    for (const { claim, attestations } of candidates) {
      console.log(claim);
      for (const entry of attestations) console.log(`  ${entry.date}: ${entry.quote}`);
    }
  } catch (error) {
    fail(error.message);
  }
} else if (command === 'write') {
  if (values.claim === undefined) fail('write needs --claim');
  try {
    const refs = parseRefs(cwd, values.refs);
    const bytes = writeClaim(cwd, readState(cwd), values.claim, refs, values.replaces);
    console.log(`wrote "${values.claim}"; ${memoryFile(cwd)} is now ${bytes} of ${MEMORY_BUDGET.bytes} bytes`);
  } catch (error) {
    fail(error.message);
  }
} else if (command === 'verify') {
  // A ref reaches this point already resolved once at write time, so a throw
  // here means the state was edited by hand; it stops the prune rather than
  // deleting lines it could not check.
  try {
    const state = readState(cwd);
    const { lines, live, dropped } = verifyLines(cwd, state);
    for (const entry of dropped) console.log(`dropped "${entry.claim}": ${entry.missing.join(', ')}`);
    if (dropped.length > 0) writeState(cwd, { candidates: state.candidates, lines });
    console.log(`${live} line${live === 1 ? '' : 's'} verified, ${dropped.length} dropped`);
  } catch (error) {
    fail(error.message);
  }
} else {
  fail(`unknown command ${command ?? '(none)'}; expected paths, render, book, propose, write or verify`);
}

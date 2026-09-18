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
import { spawnSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { configDirectory } from '#config-directory';

// The memory belongs to the repository, not to one branch or one worktree, so it
// sits in the common git directory every linked worktree shares. Outside a
// repository it falls back beside the savings record, keyed by the working
// directory's own name, the way a handoff does.
function memoryDirectory(cwd) {
  const common = spawnSync('git', ['-C', cwd, 'rev-parse', '--path-format=absolute', '--git-common-dir'], { encoding: 'utf8' });
  if (common.status === 0) return path.join(common.stdout.trim(), 'exo');
  return path.join(configDirectory(), 'exo', 'memory', path.basename(path.resolve(cwd)));
}

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
    ? 'Nothing is attested twice yet.'
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

// A claim is proposed only once two distinct sessions have booked it, so one
// session cannot teach exo something it misheard.
const ATTESTATIONS_REQUIRED = 2;

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
  process.stdout.write(render(readState(cwd)));
} else if (command === 'book') {
  if (values.claim === undefined || values.quote === undefined || values.session === undefined) {
    fail('book needs --claim, --quote and --session');
  }
  const state = readState(cwd);
  const attestations = book(state, values.claim, values.quote, values.session);
  writeState(cwd, state);
  console.log(`booked "${values.claim}": ${attestations} of ${ATTESTATIONS_REQUIRED} sessions`);
} else if (command === 'propose') {
  const candidates = proposable(readState(cwd));
  if (candidates.length === 0) {
    console.log('no claim is attested twice yet');
  }
  for (const { claim, attestations } of candidates) {
    console.log(claim);
    for (const entry of attestations) console.log(`  ${entry.date}: ${entry.quote}`);
  }
} else {
  fail(`unknown command ${command ?? '(none)'}; expected paths, render, book or propose`);
}

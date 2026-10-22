import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { Buffer } from 'node:buffer';
import { parseArgs } from 'node:util';
import { MEMORY_BUDGET } from '#budgets';
import { ATTESTATIONS_REQUIRED, memoryDirectory } from '#memory-store';

function stateFile(cwd) {
  return path.join(memoryDirectory(cwd), 'memory.json');
}

function memoryFile(cwd) {
  return path.join(memoryDirectory(cwd), 'memory.md');
}

function readState(cwd) {
  let text;
  try {
    text = fs.readFileSync(stateFile(cwd), 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return { candidates: {}, lines: [], rejected: {} };
    throw error;
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(`${stateFile(cwd)} is not valid JSON: ${error.message}`);
  }
  return { candidates: parsed.candidates ?? {}, lines: parsed.lines ?? [], rejected: parsed.rejected ?? {} };
}

const HEADER = '# Project memory\n\nexo writes this file. Do not edit it by hand: run `/exo:remember` instead.';

function isMemory(line) {
  return isLive(line) && line.decision !== true;
}

function isLive(line) {
  return line.superseded === null && line.dropped === null && line.retired == null;
}

function render(state) {
  const live = state.lines.filter(isMemory);
  const understanding = live.length === 0
    ? `Nothing is attested in ${ATTESTATIONS_REQUIRED} sessions yet.`
    : live.map((line) => `- ${line.claim} (refs: ${line.refs.join(', ')})`).join('\n');
  const decisions = live.length === 0
    ? 'Nothing has been written yet.'
    : live.map((line) => `- ${line.written} ${line.claim}`).join('\n');
  return `${[HEADER, '## Current understanding', understanding, '## Decisions', decisions].join('\n\n')}\n`;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function writeState(cwd, state) {
  fs.mkdirSync(memoryDirectory(cwd), { recursive: true });
  fs.writeFileSync(stateFile(cwd), `${JSON.stringify(state, null, 2)}\n`);
  fs.writeFileSync(memoryFile(cwd), render(state));
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function revive(state, name, session) {
  const rejection = state.rejected[name];
  if (rejection !== undefined && !rejection.sessions.includes(session)) delete state.rejected[name];
}

function book(state, claim, quote, session) {
  revive(state, claim, session);
  const attestations = (state.candidates[claim] ?? []).filter((entry) => entry.session !== session);
  attestations.push({ session, date: today(), quote });
  state.candidates[claim] = attestations;
  return attestations.length;
}

function normalizeKey(key) {
  return key.trim().toLowerCase().replace(/\s+/g, ' ');
}

function bookReview(state, key, claim, quote, session) {
  const name = `review:${key}`;
  revive(state, name, session);
  const attestations = (state.candidates[name] ?? []).filter((entry) => entry.session !== session);
  attestations.push({ session, date: today(), quote, claim, source: 'review' });
  state.candidates[name] = attestations;
  return attestations.length;
}

function proposable(state) {
  return Object.entries(state.candidates)
    .filter(([name, attestations]) => attestations.length >= ATTESTATIONS_REQUIRED && state.rejected[name] === undefined)
    .map(([claim, attestations]) => ({ claim, attestations }));
}

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

function budgetRefusal(state, bytes) {
  const live = state.lines.filter(isMemory);
  const oldest = [...live].sort((left, right) => (left.written < right.written ? -1 : 1));
  const named = oldest.slice(0, 3).map((line) => `${line.written} ${line.claim}`);
  return `refused: memory.md would be ${bytes} bytes, over the ${MEMORY_BUDGET.bytes} byte budget. Retire one of these lines, oldest first, or archive the decision history: ${named.join('; ')}`;
}

function writeClaim(cwd, state, claim, refs, replaces, name = claim) {
  const attestations = state.candidates[name] ?? [];
  if (attestations.length < ATTESTATIONS_REQUIRED) {
    throw new Error(`refused: "${claim}" is attested in ${attestations.length} session(s), and ${ATTESTATIONS_REQUIRED} are required`);
  }
  const live = state.lines.find((line) => line.claim === claim && isLive(line));
  if (live !== undefined) {
    throw new Error(`refused: "${claim}" is already live, written ${live.written}. Supersede it with --replaces or retire it rather than writing it twice`);
  }
  const written = today();
  const next = { candidates: { ...state.candidates }, lines: state.lines.map((line) => ({ ...line })), rejected: { ...state.rejected } };
  delete next.candidates[name];
  delete next.rejected[name];
  if (replaces !== undefined) {
    const predecessor = next.lines.find((line) => line.claim === replaces && isLive(line));
    if (predecessor === undefined) throw new Error(`refused: no live line reads "${replaces}"`);
    predecessor.superseded = { date: written, by: claim };
  }
  next.lines.push({
    claim,
    refs,
    written,
    quotes: attestations.map((entry) => ({ date: entry.date, quote: entry.quote })),
    superseded: null,
    dropped: null,
    retired: null
  });
  const bytes = Buffer.byteLength(render(next), 'utf8');
  if (bytes > MEMORY_BUDGET.bytes) throw new Error(budgetRefusal(next, bytes));
  writeState(cwd, next);
  return bytes;
}

function git(cwd, ...args) {
  return spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8' });
}

function decisionCommit(cwd) {
  const head = git(cwd, 'symbolic-ref', '--short', 'refs/remotes/origin/HEAD');
  const candidates = [head.status === 0 ? head.stdout.trim() : null, 'main', 'master'].filter(Boolean);
  for (const branch of candidates) {
    const base = git(cwd, 'merge-base', 'HEAD', branch);
    if (base.status === 0) return base.stdout.trim();
  }
  return null;
}

function writeDecision(cwd, state, claim, refs) {
  if (state.lines.some((line) => line.decision === true && line.claim === claim && isLive(line))) {
    throw new Error(`refused: decision "${claim}" is already stored`);
  }
  const lines = [...state.lines, {
    claim, refs, written: today(), commit: decisionCommit(cwd), decision: true,
    quotes: [], superseded: null, dropped: null, retired: null
  }];
  writeState(cwd, { candidates: state.candidates, lines, rejected: state.rejected });
}

function decisionStatus(cwd, line) {
  if (!line.commit || line.refs.length === 0) return 'settled';
  if (git(cwd, 'merge-base', '--is-ancestor', line.commit, 'HEAD').status !== 0) return 'changed';
  const files = line.refs.map((ref) => resolveRef(cwd, ref).relative);
  const numstat = git(cwd, 'diff', '--numstat', line.commit, '--', ...files);
  const added = numstat.stdout.split('\n').filter(Boolean)
    .reduce((sum, row) => sum + (Number(row.split('\t')[0]) || 0), 0);
  const total = files.reduce((sum, file) => {
    const target = path.join(cwd, file);
    return sum + (fs.existsSync(target) ? fs.readFileSync(target, 'utf8').split('\n').length - 1 : 0);
  }, 0);
  return added > total / 2 ? 'changed' : 'settled';
}

function verifyLines(cwd, state) {
  const date = today();
  let checked = 0;
  const dropped = [];
  const lines = state.lines.map((line) => {
    if (!isLive(line)) return line;
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

const USAGE = [
  'usage: node memory.mjs paths',
  '       node memory.mjs render',
  '       node memory.mjs retire --claim "<the claim>"',
  '       node memory.mjs book --source review --key <key> --claim "<defect>" --session <id> [--quote "<text>"]',
  '       node memory.mjs propose [--count]',
  '       node memory.mjs reject --session <id> (--key <key> | --claim "<the claim>")',
  '       node memory.mjs write --decision --claim "<the decision>" --refs <paths>',
  '       node memory.mjs decisions',
  'Every command takes --cwd naming the repository, defaulting to the process working directory.',
].join('\n');

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    help: { type: 'boolean' },
    cwd: { type: 'string' },
    claim: { type: 'string' },
    quote: { type: 'string' },
    session: { type: 'string' },
    refs: { type: 'string' },
    replaces: { type: 'string' },
    key: { type: 'string' },
    source: { type: 'string' },
    count: { type: 'boolean' },
    decision: { type: 'boolean' }
  }
});

const cwd = values.cwd ?? process.cwd();
const command = positionals[0];

if (values.help) {
  console.log(USAGE);
} else if (command === 'paths') {
  console.log(stateFile(cwd));
  console.log(memoryFile(cwd));
} else if (command === 'render') {
  try {
    process.stdout.write(render(readState(cwd)));
  } catch (error) {
    fail(error.message);
  }
} else if (command === 'book') {
  const review = values.source === 'review';
  const key = values.key === undefined ? undefined : normalizeKey(values.key);
  if (values.source !== undefined && values.source !== 'user' && !review) {
    fail('book --source takes user or review');
  }
  if (values.key !== undefined && !review) fail('book --key needs --source review');
  if (review && (!key || values.claim === undefined || values.session === undefined)) {
    fail('book --source review needs --key, --claim and --session');
  }
  if (!review && (values.claim === undefined || values.quote === undefined || values.session === undefined)) {
    fail('book needs --claim, --quote and --session');
  }
  try {
    const state = readState(cwd);
    if (review) {
      const attestations = bookReview(state, key, values.claim, values.quote ?? null, values.session);
      writeState(cwd, state);
      console.log(`booked "${values.claim}" under key ${key}: ${attestations} of ${ATTESTATIONS_REQUIRED} sessions`);
    } else {
      const attestations = book(state, values.claim, values.quote, values.session);
      writeState(cwd, state);
      console.log(`booked "${values.claim}": ${attestations} of ${ATTESTATIONS_REQUIRED} sessions`);
    }
  } catch (error) {
    fail(error.message);
  }
} else if (command === 'propose') {
  try {
    const candidates = proposable(readState(cwd));
    if (values.count) {
      console.log(candidates.length);
    } else if (candidates.length === 0) {
      console.log(`no claim is attested in ${ATTESTATIONS_REQUIRED} sessions yet`);
    }
    for (const { claim, attestations } of values.count ? [] : candidates) {
      if (attestations[0].source === 'review') {
        console.log(`${attestations[0].claim} (key: ${claim.slice('review:'.length)})`);
        for (const entry of attestations) console.log(`  ${entry.date}: ${entry.claim}${entry.quote === null ? '' : `; ${entry.quote}`}`);
      } else {
        console.log(claim);
        for (const entry of attestations) console.log(`  ${entry.date}: ${entry.quote}`);
      }
    }
  } catch (error) {
    fail(error.message);
  }
} else if (command === 'write') {
  if (values.claim === undefined) fail('write needs --claim');
  try {
    const refs = parseRefs(cwd, values.refs);
    if (values.decision) {
      writeDecision(cwd, readState(cwd), values.claim, refs);
      console.log(`stored decision "${values.claim}"`);
      process.exit(0);
    }
    const name = values.key === undefined ? values.claim : `review:${normalizeKey(values.key)}`;
    const bytes = writeClaim(cwd, readState(cwd), values.claim, refs, values.replaces, name);
    console.log(`wrote "${values.claim}"; ${memoryFile(cwd)} is now ${bytes} of ${MEMORY_BUDGET.bytes} bytes`);
  } catch (error) {
    fail(error.message);
  }
} else if (command === 'decisions') {
  try {
    for (const line of readState(cwd).lines.filter((entry) => entry.decision === true && isLive(entry))) {
      console.log(`${decisionStatus(cwd, line)}: ${line.claim}`);
    }
  } catch (error) {
    fail(error.message);
  }
} else if (command === 'verify') {
  try {
    const state = readState(cwd);
    const { lines, live, dropped } = verifyLines(cwd, state);
    for (const entry of dropped) console.log(`dropped "${entry.claim}": ${entry.missing.join(', ')}`);
    if (dropped.length > 0) writeState(cwd, { candidates: state.candidates, lines, rejected: state.rejected });
    console.log(`${live} line${live === 1 ? '' : 's'} verified, ${dropped.length} dropped`);
  } catch (error) {
    fail(error.message);
  }
} else if (command === 'retire') {
  if (values.claim === undefined) fail('retire needs --claim');
  try {
    const state = readState(cwd);
    const target = state.lines.find((line) => line.claim === values.claim && isLive(line));
    if (target === undefined) throw new Error(`refused: no live line reads "${values.claim}"`);
    const lines = state.lines.map((line) => (line === target ? { ...line, retired: { date: today() } } : line));
    writeState(cwd, { candidates: state.candidates, lines, rejected: state.rejected });
    console.log(`retired "${values.claim}"`);
  } catch (error) {
    fail(error.message);
  }
} else if (command === 'reject') {
  if (values.session === undefined || (values.key === undefined) === (values.claim === undefined)) {
    fail('reject needs --session and exactly one of --key or --claim');
  }
  try {
    const state = readState(cwd);
    const name = values.key === undefined ? values.claim : `review:${normalizeKey(values.key)}`;
    const attestations = state.candidates[name];
    if (attestations === undefined) throw new Error(`refused: no candidate is booked as ${name}`);
    const sessions = [...new Set([...attestations.map((entry) => entry.session), values.session])];
    state.rejected[name] = { date: today(), sessions };
    writeState(cwd, state);
    console.log(`rejected ${name}; proposed again once a session outside ${sessions.join(', ')} books it`);
  } catch (error) {
    fail(error.message);
  }
} else {
  fail(`unknown command ${command ?? '(none)'}; expected paths, render, book, propose, write, decisions, verify, retire or reject`);
}

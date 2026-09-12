// Reads the transcript the harness writes into a ledger row: usage per API
// call, lines per edit, and the overhead exo adds.
// The format is internal to the harness and may change between releases; a
// line that does not parse is skipped, never fatal.

import fs from 'node:fs';
import path from 'node:path';
import { configDirectory, emptySession, updateSessions } from './ledger.mjs';
import { OVERHEAD_VERSION, bookOverhead, emptyOverhead } from './overhead.mjs';
import { sumCounts, usageCounts } from './token-weights.mjs';

// What exo's own process writes: a brief, a plan, research notes, a designing
// run, and the handoff implementing-batch leaves under the git directory.
const EXO_PROCESS_DIRECTORIES = ['/docs/specs/', '/docs/plans/', '/docs/research/', '/.claude/plans/', '/tmp/designing/'];
const HANDOFF_FILE = '/implement-next.md';
const SESSION_ID = /^[\w-]+$/;

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

export function isExoProcessFile(filePath) {
  if (typeof filePath !== 'string') return false;
  const normalized = filePath.replaceAll('\\', '/');
  if (EXO_PROCESS_DIRECTORIES.some((directory) => normalized.includes(directory))) return true;
  return normalized.includes('/.git/') && normalized.endsWith(HANDOFF_FILE);
}

function applyEntry(session, entry, file) {
  bookOverhead(session, entry, file);
  if (typeof entry.timestamp === 'string') {
    if (session.started === null || entry.timestamp < session.started) session.started = entry.timestamp;
    if (session.updated === null || entry.timestamp > session.updated) session.updated = entry.timestamp;
  }
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
    if (counts.added + counts.removed > 0) {
      session.linesByEntry[entry.uuid] = isExoProcessFile(toolResult.filePath) ? { ...counts, process: true } : counts;
    }
  }
}

export function sumTokens(session) {
  return sumCounts(Object.values(session.usageById));
}

// Product lines added and removed. What exo's own process wrote counts in
// neither: those lines are exo's own bookkeeping, not the session's product.
export function sumLines(session) {
  const totals = { added: 0, removed: 0 };
  for (const counts of Object.values(session.linesByEntry)) {
    if (counts.process === true) continue;
    totals.added += counts.added;
    totals.removed += counts.removed;
  }
  return totals;
}

// Returns true when the row changed. A row booked by an older version is read
// again from the start, which re-records usage and lines under the same keys.
export function ingestTranscript(session, transcriptPath) {
  if (typeof transcriptPath !== 'string' || !fs.existsSync(transcriptPath)) return false;
  let changed = session.transcript !== transcriptPath;
  session.transcript = transcriptPath;
  if (session.overhead?.version !== OVERHEAD_VERSION) {
    session.overhead = emptyOverhead();
    session.offsets = {};
  }
  for (const file of transcriptFiles(transcriptPath)) {
    const { lines, offset } = appendedLines(file, session.offsets[file] ?? 0);
    for (const line of lines) {
      let entry;
      try {
        entry = JSON.parse(line);
      } catch {
        continue;
      }
      if (entry && typeof entry === 'object') applyEntry(session, entry, file);
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

// The harness keeps a transcript at <config dir>/projects/<project slug>/<session id>.jsonl.
export function findTranscript(sessionId) {
  if (!SESSION_ID.test(sessionId)) return null;
  const projects = path.join(configDirectory(), 'projects');
  let slugs;
  try {
    slugs = fs.readdirSync(projects);
  } catch {
    return null;
  }
  for (const slug of slugs) {
    const candidate = path.join(projects, slug, `${sessionId}.jsonl`);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

// A row booked by an older version is read again at once, so a finished
// session that fires no further hook still gets its overhead; a row whose
// transcript is gone keeps its figures with no overhead and is not searched
// for again.
export function refreshStaleSessions(sessions) {
  let latest = sessions;
  for (const [sessionId, stored] of Object.entries(sessions)) {
    if (stored.overhead?.version === OVERHEAD_VERSION) continue;
    latest = updateSessions((current) => {
      const row = current[sessionId];
      // Pruned, or read again by a hook, since the caller read the ledger.
      if (row === undefined || row.overhead?.version === OVERHEAD_VERSION) return false;
      const session = { ...emptySession(), ...row };
      if (!ingestTranscript(session, session.transcript ?? findTranscript(sessionId))) session.overhead = emptyOverhead();
      current[sessionId] = session;
      return true;
    });
  }
  return latest;
}

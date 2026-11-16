import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { sleepSync } from '#basics';
import { configDirectory } from '#config-directory';
import { environmentMs, isMain, parseFlags, UsageError, USAGE_EXIT } from '#script-flags';
import { projectFolder, sessionFiles, promptMessages, typedPrompt } from './sessions.mjs';

const MAX_PROMPT_CHARS = 600;
const MAX_ENTRY_CHARS = 300;
const MAX_FLAG_CHARS = 80;
const MAX_ENTRIES = 2000;
const MAX_SEEN_MARKS = 50;
const MAX_CANDIDATES = 15;
const MIN_FLAG_WORDS = 4;
const MAX_DOCUMENT_SHARE = 0.05;
const MIN_SHARED_WORDS = 3;
const MIN_JACCARD = 0.4;
const INTERRUPT_MARK = '[Request interrupted';
const STALE_LOCK_MS = 10_000;
const LOCK_RETRY_MS = 50;
const LOCK_WAIT_MS = environmentMs('EXO_LEARN_LOCK_MS', 2000);
const FOLDER_MODE = 0o700;
const FILE_MODE = 0o600;
const USAGE = 'usage: node corrections.mjs hook | session-start | backfill [--cwd <dir>] | candidates [--cwd <dir>] | keep <id...> [--cwd <dir>] | reject <id...> [--cwd <dir>] | recount [--cwd <dir>]';
const FLAGS = { cwd: 'string', help: 'boolean' };


const VERDICTS = { keep: 'kept', reject: 'rejected' };
const BUSY = Symbol('busy');

const segmenter = new Intl.Segmenter(undefined, { granularity: 'word' });

function hashed(text, length) {
  return crypto.createHash('sha1').update(text).digest('hex').slice(0, length);
}

function words(text) {
  const spoken = text.split(/\s+/).filter((token) => !token.includes('/')).join(' ');
  return [...new Set([...segmenter.segment(spoken)].filter((part) => part.isWordLike).map((part) => hashed(part.segment.toLowerCase(), 8)))].sort();
}

function cutText(text) {
  return text.trim().slice(0, MAX_ENTRY_CHARS);
}

function idOf(session, text) {
  return hashed(`${session}\n${text}`, 12);
}

export function entryOf({ date, session, text }) {
  const cut = cutText(text);
  return { id: idOf(session, cut), date, session, words: words(cut) };
}

function ledgerFile(cwd) {
  return path.join(configDirectory(), 'exo', 'learn', `${path.basename(projectFolder(cwd))}.jsonl`);
}

function verdictsFile(cwd) {
  return ledgerFile(cwd).replace(/\.jsonl$/, '.verdicts.jsonl');
}

function ensureFolder(file) {
  const folder = path.dirname(file);
  fs.mkdirSync(path.dirname(folder), { recursive: true });
  fs.mkdirSync(folder, { recursive: true, mode: FOLDER_MODE });
  fs.chmodSync(folder, FOLDER_MODE);
}

function writePrivate(file, text) {
  ensureFolder(file);
  fs.writeFileSync(file, text, { mode: FILE_MODE });
  fs.chmodSync(file, FILE_MODE);
}

function append(file, objects) {
  ensureFolder(file);
  fs.appendFileSync(file, objects.map((object) => `${JSON.stringify(object)}\n`).join(''), { mode: FILE_MODE });
  fs.chmodSync(file, FILE_MODE);
}

function lockFile(cwd) {
  return `${ledgerFile(cwd)}.lock`;
}

function acquired(lock) {
  try {
    fs.closeSync(fs.openSync(lock, 'wx', FILE_MODE));
    return true;
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    return false;
  }
}

function locked(lock, work) {
  if (!acquired(lock)) {
    const stat = fs.statSync(lock, { throwIfNoEntry: false });
    if (stat === undefined || Date.now() - stat.mtimeMs < STALE_LOCK_MS) return BUSY;
    fs.rmSync(lock, { force: true });
    if (!acquired(lock)) return BUSY;
  }
  try {
    return work();
  } finally {
    fs.rmSync(lock, { force: true });
  }
}

function waitLocked(cwd, work, waitMs = Infinity) {
  const lock = lockFile(cwd);
  ensureFolder(lock);
  const deadline = Date.now() + waitMs;
  for (;;) {
    const result = locked(lock, work);
    if (result !== BUSY || Date.now() >= deadline) return result;
    sleepSync(LOCK_RETRY_MS);
  }
}

function rowsOf(text) {
  return text.split('\n').filter((row) => row !== '').map((row) => {
    try {
      return JSON.parse(row);
    } catch {
      return null;
    }
  });
}

function ledgerOf(rows) {
  return {
    entries: rows.filter((row) => row.id !== undefined),
    verdicts: [],
    seen: rows.filter((row) => row.seen !== undefined),
    flagged: rows.filter((row) => row.flagged !== undefined)
  };
}

function readVerdicts(cwd) {
  const file = verdictsFile(cwd);
  if (!fs.existsSync(file)) return [];
  return rowsOf(fs.readFileSync(file, 'utf8'))
    .filter((row) => isRepeatedRow(row) || (Object.values(VERDICTS).includes(row?.verdict) && (Array.isArray(row.ids) || Array.isArray(row.words))));
}

function isRepeatedRow(row) {
  return typeof row?.repeated === 'string';
}

const ROW_KINDS = [
  (row) => typeof row.id === 'string' && typeof row.date === 'string' && typeof row.session === 'string' && Array.isArray(row.words),
  (row) => typeof row.seen === 'string',
  (row) => Array.isArray(row.flagged)
];

function isKnownRow(row) {
  return row !== null && ROW_KINDS.some((kind) => kind(row));
}

function cacheRows(cwd) {
  const file = ledgerFile(cwd);
  if (!fs.existsSync(file)) return null;
  const text = fs.readFileSync(file, 'utf8');
  return rowsOf(text.slice(0, text.lastIndexOf('\n') + 1));
}

function appendCache(cwd, rows) {
  const file = ledgerFile(cwd);
  const bytes = fs.existsSync(file) ? fs.readFileSync(file) : Buffer.alloc(0);
  if (bytes.length > 0 && bytes.at(-1) !== 0x0a) fs.truncateSync(file, bytes.lastIndexOf(0x0a) + 1);
  append(file, rows);
}

function currentLedger(cwd) {
  const rows = cacheRows(cwd);
  return rows !== null && rows.every(isKnownRow) ? ledgerOf(rows) : null;
}

function reset(cwd) {
  const rows = cacheRows(cwd);
  if (rows === null || rows.every(isKnownRow)) return;
  for (const name of [ledgerFile(cwd), countFile(cwd), `${ledgerFile(cwd)}.shown.json`]) fs.rmSync(name, { force: true });
}

function loadOrReset(cwd) {
  const ledger = currentLedger(cwd);
  if (ledger === null) {
    reset(cwd);
    return null;
  }
  return { ...ledger, verdicts: readVerdicts(cwd) };
}

function indexed(rows) {
  return rows.map((row) => ({ ...row, words: new Set(row.words ?? words(row.text)) }));
}

function compacted(ledger) {
  if (ledger.entries.length <= MAX_ENTRIES) return ledger;
  return { ...ledger, seen: ledger.seen.slice(-MAX_SEEN_MARKS), entries: ledger.entries.slice(-MAX_ENTRIES) };
}

function rewrite(file, ledger) {
  const temp = `${file}.${process.pid}.tmp`;
  writePrivate(temp, [...ledger.seen, ...ledger.flagged, ...ledger.entries].map((row) => `${JSON.stringify(row)}\n`).join(''));
  fs.renameSync(temp, file);
}

function compact(cwd) {
  const ledger = currentLedger(cwd);
  if (ledger === null) return;
  const kept = compacted(ledger);
  if (kept !== ledger) rewrite(ledgerFile(cwd), kept);
}

function transcriptTexts(cwd, sessions) {
  const texts = new Map();
  for (const file of sessionFiles(projectFolder(cwd))) {
    const session = path.basename(file, '.jsonl');
    if (!sessions.has(session)) continue;
    for (const { text, kind } of promptMessages(file)) {
      if (kind === 'skipped') continue;
      const cut = cutText(text);
      texts.set(idOf(session, cut), cut);
    }
  }
  return texts;
}

function countedWords(entries) {
  const frequency = new Map();
  for (const { words: entryWords } of entries) {
    for (const word of entryWords) frequency.set(word, (frequency.get(word) ?? 0) + 1);
  }
  const limit = entries.length * MAX_DOCUMENT_SHARE;
  return new Set([...frequency].filter(([, count]) => count >= 2 && count <= limit).map(([word]) => word));
}

function similar(a, b, counted) {
  const left = [...a].filter((word) => counted.has(word));
  const right = new Set([...b].filter((word) => counted.has(word)));
  const shared = left.filter((word) => right.has(word)).length;
  return shared >= MIN_SHARED_WORDS && shared / (left.length + right.size - shared) >= MIN_JACCARD;
}

function rowMatches(row, entry, counted) {
  return Boolean(row.ids?.includes(entry.id)) || (row.words !== undefined && similar(entry.words, row.words, counted));
}

function decider(verdicts, counted) {
  return (entry) => verdicts.some((row) => rowMatches(row, entry, counted));
}

function byAge(a, b) {
  return a.date.localeCompare(b.date) || a.id.localeCompare(b.id);
}

function neighbourCount(group, counted) {
  return (entry) => group.filter((other) => other !== entry && similar(entry.words, other.words, counted)).length;
}

function medoid(group, counted, texts) {
  const neighbours = neighbourCount(group, counted);
  const best = group.filter(({ id }) => texts.has(id)).map((entry) => ({ entry, neighbours: neighbours(entry) })).sort((a, b) => b.neighbours - a.neighbours || texts.get(a.entry.id).length - texts.get(b.entry.id).length)[0];
  return best && texts.get(best.entry.id);
}

function clusters(ledger) {
  const indexedEntries = indexed(ledger.entries);
  const counted = countedWords(indexedEntries);
  const decided = decider(ledger.verdicts, counted);
  const entries = indexedEntries.filter((entry) => !decided(entry));
  const parent = entries.map((_, index) => index);
  const root = (index) => (parent[index] === index ? index : (parent[index] = root(parent[index])));
  for (let i = 0; i < entries.length; i += 1) {
    for (let j = i + 1; j < entries.length; j += 1) {
      if (similar(entries[i].words, entries[j].words, counted)) parent[root(j)] = root(i);
    }
  }
  const groups = new Map();
  entries.forEach((entry, index) => groups.set(root(index), [...(groups.get(root(index)) ?? []), entry]));
  return [...groups.values()]
    .map((group) => ({ group: group.sort(byAge), sessions: new Set(group.map(({ session }) => session)).size }))
    .filter(({ sessions }) => sessions >= 2)
    .sort((a, b) => b.sessions - a.sessions || byAge(b.group.at(-1), a.group.at(-1)))
    .map(({ group, sessions }) => ({ id: group[0].id, group, counted, sessions, first: group[0].date, last: group.at(-1).date }));
}

function listed(cwd, ledger) {
  const top = clusters(ledger);
  const texts = transcriptTexts(cwd, new Set(top.flatMap(({ group }) => group.map(({ session }) => session))));
  return top
    .map((cluster) => ({ ...cluster, text: medoid(cluster.group, cluster.counted, texts) }))
    .filter(({ text }) => text !== undefined);
}

function describe({ id, text, sessions, first, last }) {
  return `${id} "${text}" (${sessions} sessions, ${first} to ${last})`;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function recordable(text) {
  return text.length <= MAX_PROMPT_CHARS && !text.startsWith(INTERRUPT_MARK);
}

function startDetached(command, cwd) {
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url), command, '--cwd', cwd], { detached: true, stdio: 'ignore', env: process.env });
  child.unref();
}

function countFile(cwd) {
  return `${ledgerFile(cwd)}.count`;
}

function readCount(cwd) {
  return fs.existsSync(countFile(cwd)) ? JSON.parse(fs.readFileSync(countFile(cwd), 'utf8')) : { count: 0, printed: 0 };
}

function dropGone(cwd) {
  const ledger = currentLedger(cwd);
  if (ledger === null) return;
  const live = new Set(sessionFiles(projectFolder(cwd)).map((file) => path.basename(file, '.jsonl')));
  const kept = { ...ledger, entries: ledger.entries.filter(({ session, date }) => live.has(session) || date >= today()) };
  if (kept.entries.length !== ledger.entries.length) rewrite(ledgerFile(cwd), kept);
}

function snapshot(cwd) {
  return waitLocked(cwd, () => loadOrReset(cwd));
}

function recount(cwd) {
  const ledger = waitLocked(cwd, () => {
    dropGone(cwd);
    return loadOrReset(cwd);
  });
  if (ledger === null) return;
  const count = listed(cwd, ledger).length;
  waitLocked(cwd, () => writePrivate(countFile(cwd), JSON.stringify({ ...readCount(cwd), count })));
}

function announcement(counts) {
  if (counts.count === 0 || counts.count === counts.printed) return { counts, line: '' };
  return { counts: { ...counts, printed: counts.count }, line: `Exo found ${counts.count} new memories; /exo:learn lists them.` };
}

function keptRepeat(verdicts, kept, entries, counted) {
  const row = verdicts[kept];
  const id = row.ids?.[0] ?? entries.find((entry) => rowMatches(row, entry, counted)).id;
  return verdicts.slice(kept + 1).some((later) => later.repeated === id) ? null : id;
}

function react(ledger, { session, prompt, date }, textOf) {
  const text = prompt.trim();
  const recorded = recordable(text) ? [entryOf({ date, session, text })] : [];
  const first = !ledger.seen.some(({ seen }) => seen === session) && !ledger.entries.some((entry) => entry.session === session);
  const rows = first ? [{ seen: session }, ...recorded] : recorded;
  const quiet = { rows, first, line: '', flag: null, flaggable: false, repeated: null };
  if (first || recorded.length === 0) return quiet;
  const entries = indexed([...ledger.entries, ...recorded]);
  const current = entries.at(-1);
  const counted = countedWords(entries);
  if ([...current.words].filter((word) => counted.has(word)).length < MIN_FLAG_WORDS) return quiet;
  const flaggable = { ...quiet, flaggable: true };
  const matches = entries.filter((other) => other.session !== session && similar(current.words, other.words, counted)).sort(byAge);
  const earlier = matches.at(-1);
  const related = [...matches, current];
  const newest = ledger.verdicts.findLastIndex((row) => related.some((entry) => rowMatches(row, entry, counted)));
  if (newest !== -1 && ledger.verdicts[newest].verdict === VERDICTS.reject) return flaggable;
  const repeated = newest === -1 ? null : keptRepeat(ledger.verdicts, newest, related, counted);
  if (repeated !== null) return { ...flaggable, line: `exo: this repeats a lesson you kept, so that lesson did not stop the mistake; exo:learn makes it stronger (id ${repeated}).\n`, repeated };
  if (newest !== -1 || !earlier || ledger.flagged.some((row) => similar(current.words, row.flagged, counted))) return flaggable;
  const earlierText = textOf(earlier);
  if (earlierText === undefined) return flaggable;
  return {
    ...flaggable,
    rows: [...rows, { flagged: recorded[0].words }],
    line: `exo: you asked something like this on ${earlier.date}: "${earlierText.slice(0, MAX_FLAG_CHARS)}". exo:learn turns a repeated correction or wish into a check or lesson (id ${earlier.id}).\n`,
    flag: { text: cutText(text), earlier: { ...earlier, text: earlierText }, sessions: new Set(matches.map(({ session: other }) => other)).size }
  };
}

function create(cwd, session, prompt, date) {
  const file = ledgerFile(cwd);
  let descriptor;
  try {
    descriptor = fs.openSync(file, 'wx', FILE_MODE);
  } catch (error) {
    if (error.code === 'EEXIST') return false;
    throw error;
  }
  const text = prompt.trim();
  const rows = [{ seen: session }, ...(recordable(text) ? [entryOf({ date, session, text })] : [])];
  fs.writeSync(descriptor, rows.map((row) => `${JSON.stringify(row)}\n`).join(''));
  fs.closeSync(descriptor);
  return true;
}

function recordPrompt(cwd, session, prompt, date) {
  let ledger = loadOrReset(cwd);
  if (ledger === null) {
    if (create(cwd, session, prompt, date)) return { line: '', detached: 'backfill' };
    ledger = loadOrReset(cwd);
  }
  const textOf = (entry) => transcriptTexts(cwd, new Set([entry.session])).get(entry.id);
  const result = react(ledger, { session, prompt, date }, textOf);
  appendCache(cwd, result.rows);
  if (result.repeated !== null) append(verdictsFile(cwd), [{ repeated: result.repeated }]);
  compact(cwd);
  return { line: result.line, detached: null };
}

function projectRoot(cwd) {
  return process.env.CLAUDE_PROJECT_DIR || cwd;
}

function hook({ session_id: session, prompt, cwd: hookCwd }) {
  if (!typedPrompt(prompt)) return;
  const cwd = projectRoot(hookCwd);
  const date = today();
  const outcome = waitLocked(cwd, () => recordPrompt(cwd, session, prompt, date), LOCK_WAIT_MS);
  if (outcome === BUSY) return;
  if (outcome.detached !== null) startDetached(outcome.detached, cwd);
  process.stdout.write(outcome.line);
}

function announce(cwd) {
  const line = waitLocked(cwd, () => {
    const announced = announcement(readCount(cwd));
    if (announced.line !== '') writePrivate(countFile(cwd), JSON.stringify(announced.counts));
    return announced.line;
  }, LOCK_WAIT_MS);
  if (line === BUSY) return;
  startDetached('recount', cwd);
  if (line === '') return;
  process.stdout.write(JSON.stringify({ systemMessage: line, hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: line } }));
}

function backfill(cwd) {
  const entries = sessionFiles(projectFolder(cwd)).reverse().flatMap((sessionFile) => {
    const session = path.basename(sessionFile, '.jsonl');
    return promptMessages(sessionFile)
      .filter(({ text, kind }) => kind !== 'skipped' && recordable(text.trim()))
      .map(({ text, timestamp }) => entryOf({ date: timestamp.slice(0, 10), session, text }));
  });
  waitLocked(cwd, () => {
    const rows = cacheRows(cwd) ?? [];
    if (!rows.every(isKnownRow)) return;
    const known = new Set(ledgerOf(rows).entries.map(({ id }) => id));
    appendCache(cwd, entries.filter(({ id }) => !known.has(id)));
    compact(cwd);
  });
  recount(cwd);
}

function candidates(cwd) {
  const ledger = snapshot(cwd);
  if (ledger === null) return;
  const all = listed(cwd, ledger);
  const shown = all.slice(0, MAX_CANDIDATES);
  process.stdout.write(shown.map((cluster) => `${describe(cluster)}\n`).join(''));
  if (all.length > shown.length) process.stdout.write(`${shown.length} of ${all.length} shown; keep or reject these to see more.\n`);
}

function openRow(command, id, open) {
  const cluster = open.find(({ group }) => group.some((entry) => entry.id === id));
  if (cluster === undefined) return null;
  const { group, counted } = cluster;
  const neighbours = neighbourCount(group, counted);
  const centre = group.reduce((best, entry) => (neighbours(entry) > neighbours(best) ? entry : best));
  return { verdict: VERDICTS[command], ids: group.map((entry) => entry.id), words: [...centre.words] };
}

function decidedRow(command, id, verdicts, entries) {
  const entry = entries.find((candidate) => candidate.id === id) ?? { id, words: new Set() };
  const counted = countedWords(entries);
  const row = verdicts.findLast((candidate) => rowMatches(candidate, entry, counted));
  return row === undefined ? null : { verdict: VERDICTS[command], ids: row.ids ?? [id], words: row.words };
}

function decide(command, ids, cwd) {
  if (ids.length === 0) throw new UsageError(`${command} needs candidate ids`);
  const ledger = snapshot(cwd);
  const open = ledger === null ? [] : clusters(ledger);
  const verdicts = waitLocked(cwd, () => readVerdicts(cwd));
  const entries = ledger === null ? [] : indexed(ledger.entries);
  const rows = ids.map((id) => {
    const row = openRow(command, id, open) ?? decidedRow(command, id, verdicts, entries);
    if (row === null) throw new UsageError(`${command} id '${id}' is not in an open or decided candidate`);
    return row;
  });
  waitLocked(cwd, () => append(verdictsFile(cwd), rows));
  process.stdout.write(rows.map((row) => `${row.ids[0]} ${row.verdict}\n`).join(''));
  recount(cwd);
}

async function readInput() {
  let text = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) text += chunk;
  return text;
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  if (command === 'hook') {
    try {
      hook(JSON.parse(await readInput()));
    } catch (error) {
      console.error(`exo learn hook: ${error.message}`);
    }
    return;
  }
  if (command === 'session-start') {
    try {
      await readInput().then((input) => announce(projectRoot(JSON.parse(input).cwd)));
    } catch (error) {
      console.error(`exo learn session-start: ${error.message}`);
    }
    return;
  }
  const split = rest.findIndex((token) => token.startsWith('--'));
  const ids = split === -1 ? rest : rest.slice(0, split);
  const values = parseFlags(split === -1 ? [] : rest.slice(split), FLAGS, { usage: USAGE });
  const cwd = values.cwd ?? projectRoot(process.cwd());
  if (command === 'backfill') backfill(cwd);
  else if (command === 'candidates') candidates(cwd);
  else if (command === 'recount') recount(cwd);
  else if (command === 'keep' || command === 'reject') decide(command, ids, cwd);
  else throw new UsageError(USAGE);
}

if (isMain(import.meta.url)) {
  try {
    await main();
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    console.error(error.message);
    process.exitCode = USAGE_EXIT;
  }
}

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { sleepSync } from '#basics';
import { configDirectory } from '#config-directory';
import { compactStateLine } from '#compact-state';
import { scratchPath } from '#scratch-path';
import { environmentMs, isMain, parseFlags, UsageError, USAGE_EXIT } from '#script-flags';
import { lessonPaths } from './lessons.mjs';
import { projectFolder, sessionFiles, promptMessages, toolCalls, typedPrompt } from './sessions.mjs';

const MAX_PROMPT_CHARS = 600;
const MAX_ENTRY_CHARS = 300;
export const MIN_SESSIONS = 3;
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
const PROJECT_LEDGER = /^[A-Za-z0-9-]+\.jsonl$/;
const USAGE = 'usage: node corrections.mjs hook | session-start | backfill [--cwd <dir>] | candidates [--texts] [--cwd <dir>] | keep <id...> [--cwd <dir>] | reject <id...> [--cwd <dir>] | recount [--cwd <dir>]';
const FLAGS = { cwd: 'string', texts: 'boolean', help: 'boolean' };


const VERDICTS = { keep: 'kept', reject: 'rejected' };
const BUSY = Symbol('busy');
const UNWRITABLE = ['EPERM', 'EACCES', 'EROFS'];
const UNREADABLE = ['EPERM', 'EACCES'];

let fallbackStore = false;

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

function failureOf({ date, session, text }) {
  const cut = cutText(text);
  return { id: idOf(session, cut), date, session, words: words(cut.replace(/[/.-]/g, ' ')) };
}

function ledgerName(cwd) {
  return `${path.basename(projectFolder(cwd))}.jsonl`;
}

function configLedger(cwd) {
  return path.join(configDirectory(), 'exo', 'learn', ledgerName(cwd));
}

function fallbackLedger(cwd) {
  return path.join(scratchPath(cwd, 'learn'), ledgerName(cwd));
}

function ledgerFile(cwd) {
  return fallbackStore ? fallbackLedger(cwd) : configLedger(cwd);
}

function readableLedgers(cwd) {
  return fallbackStore ? [configLedger(cwd), fallbackLedger(cwd)] : [configLedger(cwd)];
}

function verdictsOf(ledger) {
  return ledger.replace(/\.jsonl$/, '.verdicts.jsonl');
}

function verdictsFile(cwd) {
  return verdictsOf(ledgerFile(cwd));
}

function failuresOf(ledger) {
  return ledger.replace(/\.jsonl$/, '.failures.jsonl');
}

function failuresFile(cwd) {
  return failuresOf(ledgerFile(cwd));
}

function ensureFolder(file) {
  const folder = path.dirname(file);
  fs.mkdirSync(path.dirname(folder), { recursive: true });
  fs.mkdirSync(folder, { recursive: true, mode: FOLDER_MODE });
  fs.chmodSync(folder, FOLDER_MODE);
}

function readText(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch (error) {
    if (!UNREADABLE.includes(error.code)) throw error;
    return null;
  }
}

function configStoreUsable(cwd) {
  try {
    ensureFolder(configLedger(cwd));
  } catch (error) {
    if (!UNWRITABLE.includes(error.code)) throw error;
    return false;
  }
  return !fs.existsSync(configLedger(cwd)) || readText(configLedger(cwd)) !== null;
}

function ensureStore(cwd) {
  fallbackStore ||= !configStoreUsable(cwd);
  if (fallbackStore) ensureFolder(fallbackLedger(cwd));
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
  ensureStore(cwd);
  const lock = lockFile(cwd);
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

function rowsIn(file) {
  return fs.existsSync(file) ? rowsOf(readText(file) ?? '') : [];
}

function verdictRows(file) {
  return rowsIn(file).filter((row) => isRepeatedRow(row) || (Object.values(VERDICTS).includes(row?.verdict) && (Array.isArray(row.ids) || Array.isArray(row.words))));
}

function readVerdicts(cwd) {
  return readableLedgers(cwd).map(verdictsOf).flatMap(verdictRows);
}

function isRepeatedRow(row) {
  return typeof row?.repeated === 'string';
}

function isFailedRow(row) {
  return row.failed === true;
}

function isEntryRow(row) {
  return typeof row.id === 'string' && typeof row.date === 'string' && typeof row.session === 'string' && Array.isArray(row.words);
}

const ROW_KINDS = [
  isEntryRow,
  (row) => typeof row.seen === 'string',
  (row) => Array.isArray(row.flagged)
];

function isKnownRow(row) {
  return row !== null && ROW_KINDS.some((kind) => kind(row));
}

function cacheRows(cwd) {
  const texts = readableLedgers(cwd).filter((file) => fs.existsSync(file)).map(readText).filter((text) => text !== null);
  if (texts.length === 0) return null;
  const lines = texts.flatMap((text) => text.slice(0, text.lastIndexOf('\n') + 1).split('\n').filter((row) => row !== ''));
  return rowsOf((fallbackStore ? [...new Set(lines)] : lines).join('\n'));
}

function appendRows(file, rows) {
  const bytes = fs.existsSync(file) ? fs.readFileSync(file) : Buffer.alloc(0);
  if (bytes.length > 0 && bytes.at(-1) !== 0x0a) fs.truncateSync(file, bytes.lastIndexOf(0x0a) + 1);
  append(file, rows);
}

function entryRows(file) {
  return rowsIn(file).filter((row) => row !== null && isEntryRow(row));
}

function readFailures(cwd) {
  const rows = readableLedgers(cwd).map(failuresOf).flatMap(entryRows);
  return [...new Map(rows.map((row) => [row.id, row])).values()];
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
  return rows.map((row) => ({ ...row, words: new Set(row.words) }));
}

function compacted(ledger) {
  if (ledger.entries.length <= MAX_ENTRIES) return ledger;
  return { ...ledger, seen: ledger.seen.slice(-MAX_SEEN_MARKS), entries: ledger.entries.slice(-MAX_ENTRIES) };
}

function rewrite(file, rows) {
  const temp = `${file}.${process.pid}.tmp`;
  writePrivate(temp, rows.map((row) => `${JSON.stringify(row)}\n`).join(''));
  fs.renameSync(temp, file);
}

function ledgerRows(ledger) {
  return [...ledger.seen, ...ledger.flagged, ...ledger.entries];
}

function compact(cwd) {
  const ledger = currentLedger(cwd);
  if (ledger === null) return;
  const kept = compacted(ledger);
  if (kept !== ledger) rewrite(ledgerFile(cwd), ledgerRows(kept));
}

function transcriptTexts(folder, sessions) {
  const texts = new Map();
  for (const file of sessionFiles(folder)) {
    const session = path.basename(file, '.jsonl');
    if (!sessions.has(session)) continue;
    for (const { text, kind } of promptMessages(file)) {
      if (kind === 'skipped') continue;
      const cut = cutText(text);
      texts.set(idOf(session, cut), cut);
    }
    for (const { text } of toolCalls(file).filter(({ failed }) => failed)) {
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
  return best && best.entry;
}

function otherText(group, centre, texts) {
  const other = group.findLast(({ id, session }) => session !== centre.session && texts.has(id));
  return other && texts.get(other.id);
}

function groupsOf(rows, verdicts, counted, ownCounted) {
  const decided = decider(verdicts, ownCounted);
  const entries = rows.filter((entry) => !decided(entry));
  const parent = entries.map((_, index) => index);
  const root = (index) => (parent[index] === index ? index : (parent[index] = root(parent[index])));
  const postings = new Map();
  entries.forEach(({ words: entryWords }, index) => {
    for (const word of [...entryWords].filter((candidate) => counted.has(candidate))) {
      if (!postings.has(word)) postings.set(word, []);
      postings.get(word).push(index);
    }
  });
  entries.forEach((entry, i) => {
    const shared = new Map();
    for (const word of entry.words) for (const j of postings.get(word) ?? []) if (j > i) shared.set(j, (shared.get(j) ?? 0) + 1);
    for (const [j, count] of shared) if (count >= MIN_SHARED_WORDS && similar(entry.words, entries[j].words, counted)) parent[root(j)] = root(i);
  });
  const groups = new Map();
  entries.forEach((entry, index) => groups.set(root(index), [...(groups.get(root(index)) ?? []), entry]));
  return [...groups.values()];
}

function counting(ledger) {
  const prompts = indexed(ledger.entries);
  const failures = indexed(ledger.failures);
  const own = [...prompts, ...failures].filter(({ project }) => project === undefined);
  return { prompts, failures, counted: countedWords([...prompts, ...failures]), ownCounted: countedWords(own) };
}

export function clusters(ledger) {
  const { prompts, failures, counted, ownCounted } = counting(ledger);
  const promptGroups = groupsOf(prompts, ledger.verdicts.filter((row) => !isFailedRow(row)), counted, ownCounted).map((group) => ({ group, failed: false }));
  const failureGroups = groupsOf(failures, ledger.verdicts.filter(isFailedRow), counted, ownCounted).map((group) => ({ group, failed: true }));
  return [...promptGroups, ...failureGroups]
    .map(({ group, failed }) => ({ group: group.sort(byAge), failed, sessions: new Set(group.map(({ session }) => session)).size }))
    .filter(({ group, sessions }) => sessions >= MIN_SESSIONS && group.some(({ project }) => project === undefined))
    .sort((a, b) => b.sessions - a.sessions || byAge(b.group.at(-1), a.group.at(-1)))
    .map(({ group, failed, sessions }) => ({ id: group[0].id, group, failed, counted, sessions, projects: new Set(group.map(({ project }) => project)).size, first: group[0].date, last: group.at(-1).date }));
}

function listed(cwd, ledger, withTexts = false) {
  const top = clusters(ledger);
  const rows = top.flatMap(({ group }) => group);
  const sessions = new Set(rows.map(({ session }) => session));
  const here = projectFolder(cwd);
  const texts = transcriptTexts(here, sessions);
  const others = withTexts ? new Set(rows.flatMap(({ project }) => (project === undefined ? [] : [project]))) : new Set();
  const allTexts = new Map([...texts, ...[...others].flatMap((project) => [...transcriptTexts(path.join(path.dirname(here), project), sessions)])]);
  return top
    .map((cluster) => ({ cluster, centre: medoid(cluster.group, cluster.counted, texts) }))
    .filter(({ centre }) => centre !== undefined)
    .map(({ cluster, centre }) => ({ ...cluster, text: texts.get(centre.id), other: otherText(cluster.group, centre, allTexts) }));
}

function cleanCalls(cwd) {
  return sessionFiles(projectFolder(cwd)).flatMap((file) => toolCalls(file).filter(({ failed }) => !failed).map(failureOf));
}

function laterCleanRuns(members, counted, calls) {
  const last = members.reduce((latest, { date }) => (date > latest ? date : latest), '');
  return new Set(calls.filter((call) => call.date > last && members.some((row) => similar(call.words, row.words, counted))).map(({ session }) => session)).size;
}

function keptFailures(ledger, calls) {
  const { failures, counted, ownCounted } = counting(ledger);
  const verdicts = ledger.verdicts.filter(isFailedRow);
  return verdicts.flatMap((row, index) => {
    if (row.verdict !== VERDICTS.keep || row.project !== undefined) return [];
    const members = failures.filter((entry) => rowMatches(row, entry, ownCounted));
    if (members.length === 0 || verdicts.slice(index + 1).some((later) => members.some((entry) => rowMatches(later, entry, ownCounted)))) return [];
    return [{ id: row.ids?.[0] ?? members[0].id, clean: laterCleanRuns(members, counted, calls) }];
  }).filter(({ clean }) => clean > 0);
}

function describe({ id, failed, text, sessions, projects, first, last, clean }) {
  return `${id} ${failed ? 'failed: ' : ''}"${text}" (${sessions} sessions, ${first} to ${last}${clean > 0 ? `, ${clean} later clean runs` : ''})${projects >= 2 ? ` global (${projects} projects)` : ''}`;
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
  const live = new Set(sessionFiles(projectFolder(cwd)).map((file) => path.basename(file, '.jsonl')));
  const alive = ({ session, date }) => live.has(session) || date >= today();
  const failures = readFailures(cwd);
  if (!failures.every(alive)) rewrite(failuresFile(cwd), failures.filter(alive));
  const ledger = currentLedger(cwd);
  if (ledger === null) return;
  const kept = { ...ledger, entries: ledger.entries.filter(alive) };
  if (kept.entries.length !== ledger.entries.length) rewrite(ledgerFile(cwd), ledgerRows(kept));
}

function failedCalls(cwd, since) {
  const scannedAt = new Date();
  const files = sessionFiles(projectFolder(cwd)).filter((file) => fs.statSync(file).mtimeMs >= since);
  return { scannedAt, rows: files.flatMap((file) => toolCalls(file).filter(({ failed }) => failed).map(failureOf)) };
}

function storeFailures(cwd, { scannedAt, rows }) {
  const file = failuresFile(cwd);
  const stored = readFailures(cwd);
  const known = new Set(stored.map(({ id }) => id));
  const fresh = [...new Map(rows.filter(({ id }) => !known.has(id)).map((row) => [row.id, row])).values()];
  if (stored.length + fresh.length > MAX_ENTRIES) rewrite(file, [...stored, ...fresh].slice(-MAX_ENTRIES));
  else appendRows(file, fresh);
  fs.utimesSync(file, scannedAt, scannedAt);
}

function failuresWrittenAt(cwd) {
  return fs.statSync(failuresFile(cwd), { throwIfNoEntry: false })?.mtimeMs ?? -Infinity;
}

export function readLedger(cwd) {
  return { ...(currentLedger(cwd) ?? ledgerOf([])), verdicts: readVerdicts(cwd), failures: readFailures(cwd) };
}

function withFailures(cwd, ledger) {
  return ledger === null ? null : { ...ledger, failures: readFailures(cwd) };
}

function otherLedgers(cwd) {
  if (fallbackStore) return [];
  const folder = path.dirname(configLedger(cwd));
  return fs.readdirSync(folder).filter((name) => PROJECT_LEDGER.test(name) && name !== ledgerName(cwd)).map((name) => path.join(folder, name));
}

function withOtherProjects(cwd, ledger) {
  if (ledger === null) return null;
  const others = otherLedgers(cwd);
  const from = (read) => others.flatMap((file) => read(file).map((row) => ({ ...row, project: path.basename(file, '.jsonl') })));
  return {
    ...ledger,
    entries: [...ledger.entries, ...from(entryRows)],
    failures: [...ledger.failures, ...from((file) => entryRows(failuresOf(file)))],
    verdicts: [...ledger.verdicts, ...from((file) => verdictRows(verdictsOf(file)))]
  };
}

function allProjects(cwd) {
  return withOtherProjects(cwd, withFailures(cwd, loadOrReset(cwd)));
}

function snapshot(cwd) {
  return waitLocked(cwd, () => allProjects(cwd));
}

function recount(cwd) {
  const found = failedCalls(cwd, waitLocked(cwd, () => failuresWrittenAt(cwd)));
  const ledger = waitLocked(cwd, () => {
    storeFailures(cwd, found);
    dropGone(cwd);
    return allProjects(cwd);
  });
  if (ledger === null) return;
  const count = listed(cwd, ledger).length;
  waitLocked(cwd, () => writePrivate(countFile(cwd), JSON.stringify({ ...readCount(cwd), count })));
}

function announcement(counts) {
  if (counts.count === 0 || counts.count === counts.printed) return { counts, line: '' };
  return { counts: { ...counts, printed: counts.count }, line: `Exo found ${counts.count} new memories; /exo:learn lists them.` };
}

function noteName(text) {
  const lines = text.split('\n');
  const close = lines[0] === '---' ? lines.indexOf('---', 1) : -1;
  const line = lines.slice(1, close === -1 ? 1 : close).find((candidate) => candidate.startsWith('name:'));
  return line?.slice('name:'.length).trim() || undefined;
}

function lessonNameFor(cwd, keptWords) {
  const kept = new Set(keptWords);
  const stores = new Set(['project store', 'personal store']);
  const best = lessonPaths(cwd)
    .filter(([label]) => stores.has(label))
    .flatMap(([, dir]) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((file) => file.endsWith('.md') && file !== 'index.md').sort().map((file) => path.join(dir, file)) : []))
    .map((file) => {
      const text = fs.readFileSync(file, 'utf8');
      return { name: noteName(text), shared: words(text).filter((word) => kept.has(word)).length };
    })
    .filter(({ name, shared }) => name !== undefined && shared >= MIN_SHARED_WORDS)
    .sort((left, right) => right.shared - left.shared)[0];
  return best?.name;
}

function keptRepeat(verdicts, kept, entries, counted) {
  const row = verdicts[kept];
  const id = row.ids?.[0] ?? entries.find((entry) => rowMatches(row, entry, counted)).id;
  return verdicts.slice(kept + 1).some((later) => later.repeated === id) ? null : id;
}

function react(ledger, { session, prompt, date }, textOf, nameOf) {
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
  const matchedSessions = new Set(matches.map(({ session: other }) => other)).size;
  const related = [...matches, current];
  const newest = ledger.verdicts.findLastIndex((row) => related.some((entry) => rowMatches(row, entry, counted)));
  if (newest !== -1 && ledger.verdicts[newest].verdict === VERDICTS.reject) return flaggable;
  const repeated = newest === -1 ? null : keptRepeat(ledger.verdicts, newest, related, counted);
  if (repeated !== null) {
    const keptWords = ledger.verdicts[newest].words;
    const name = Array.isArray(keptWords) ? nameOf(keptWords) : undefined;
    const lesson = name === undefined ? 'a lesson' : `the lesson "${name}"`;
    return { ...flaggable, line: `exo: this prompt shares words with ${lesson} you kept (id ${repeated}); if it shows the lesson failed, run exo:learn to strengthen it\n`, repeated };
  }
  if (newest !== -1 || matchedSessions < MIN_SESSIONS - 1 || ledger.flagged.some((row) => similar(current.words, row.flagged, counted))) return flaggable;
  const earlierText = textOf(earlier);
  if (earlierText === undefined) return flaggable;
  return {
    ...flaggable,
    rows: [...rows, { flagged: recorded[0].words }],
    line: `exo: you asked something like this on ${earlier.date}: "${earlierText.slice(0, MAX_FLAG_CHARS)}". If it repeats a correction or wish, run exo:learn on it (id ${earlier.id}).\n`,
    flag: { text: cutText(text), earlier: { ...earlier, text: earlierText }, sessions: matchedSessions }
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
  const textOf = (entry) => transcriptTexts(projectFolder(cwd), new Set([entry.session])).get(entry.id);
  const result = react({ ...ledger, verdicts: ledger.verdicts.filter((row) => !isFailedRow(row)) }, { session, prompt, date }, textOf, (keptWords) => lessonNameFor(cwd, keptWords));
  appendRows(ledgerFile(cwd), result.rows);
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
  const found = failedCalls(cwd, -Infinity);
  waitLocked(cwd, () => {
    storeFailures(cwd, found);
    const rows = cacheRows(cwd) ?? [];
    if (!rows.every(isKnownRow)) return;
    const known = new Set(ledgerOf(rows).entries.map(({ id }) => id));
    appendRows(ledgerFile(cwd), entries.filter(({ id }) => !known.has(id)));
    compact(cwd);
  });
  recount(cwd);
}

function candidates(cwd, withTexts) {
  const ledger = snapshot(cwd);
  if (ledger === null) return;
  const all = listed(cwd, ledger, withTexts);
  const calls = all.some(({ failed }) => failed) || ledger.verdicts.some(isFailedRow) ? cleanCalls(cwd) : [];
  const shown = all.slice(0, MAX_CANDIDATES).map((cluster) => (cluster.failed ? { ...cluster, clean: laterCleanRuns(cluster.group, cluster.counted, calls) } : cluster));
  process.stdout.write(shown.map((cluster) => `${describe(cluster)}\n${withTexts && cluster.other !== undefined ? `  other session: "${cluster.other}"\n` : ''}`).join(''));
  if (all.length > shown.length) process.stdout.write(`${shown.length} of ${all.length} shown; keep or reject these to see more.\n`);
  process.stdout.write(keptFailures(ledger, calls).map(({ id, clean }) => `${id} kept, ${clean} later clean runs\n`).join(''));
}

function marked(row, failed) {
  return failed ? { ...row, failed: true } : row;
}

function openRow(command, id, open) {
  const cluster = open.find(({ group }) => group.some((entry) => entry.id === id));
  if (cluster === undefined) return null;
  const { group, counted, failed } = cluster;
  const neighbours = neighbourCount(group, counted);
  const centre = group.reduce((best, entry) => (neighbours(entry) > neighbours(best) ? entry : best));
  return marked({ verdict: VERDICTS[command], ids: group.map((entry) => entry.id), words: [...centre.words] }, failed);
}

function decidedRow(command, id, verdicts, entries, counted) {
  const entry = entries.find((candidate) => candidate.id === id) ?? { id, words: new Set() };
  const row = verdicts.findLast((candidate) => rowMatches(candidate, entry, counted));
  return row === undefined ? null : marked({ verdict: VERDICTS[command], ids: row.ids ?? [id], words: row.words }, isFailedRow(row));
}

function decide(command, ids, cwd) {
  if (ids.length === 0) throw new UsageError(`${command} needs candidate ids`);
  const ledger = snapshot(cwd);
  const open = ledger === null ? [] : clusters(ledger);
  const verdicts = waitLocked(cwd, () => readVerdicts(cwd));
  const { prompts, failures, ownCounted } = counting(ledger ?? { entries: [], failures: [] });
  const rows = ids.map((id) => {
    const row = openRow(command, id, open)
      ?? decidedRow(command, id, verdicts.filter((verdict) => !isFailedRow(verdict)), prompts, ownCounted)
      ?? decidedRow(command, id, verdicts.filter(isFailedRow), failures, ownCounted);
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
      const input = JSON.parse(await readInput());
      if (input.source === 'compact') {
        const line = compactStateLine(projectRoot(input.cwd));
        if (line !== '') process.stdout.write(`${line}\n`);
      } else announce(projectRoot(input.cwd));
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
  else if (command === 'candidates') candidates(cwd, values.texts === true);
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

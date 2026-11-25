import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { compactStateLine } from '#compact-state';
import { environmentMs, isMain, parseFlags, UsageError, USAGE_EXIT } from '#script-flags';
import { byAge, cleanCalls, clusters, countedWords, counting, cutText, describe, entryOf, failureOf, keptFailures, laterCleanRuns, listed, MIN_SESSIONS, MIN_SHARED_WORDS, neighbourCount, rowMatches, similar, transcriptTexts, words } from './clusters.mjs';
import { append, appendRows, BUSY, cacheRows, compact, countFile, currentLedger, entryRows, failuresFile, failuresOf, indexed, isFailedRow, isKnownRow, ledgerFile, ledgerOf, ledgerRows, loadOrReset, FILE_MODE, MAX_ENTRIES, otherLedgers, readFailures, readVerdicts, rewrite, VERDICTS, verdictRows, verdictsFile, verdictsOf, waitLocked, writePrivate } from './ledger.mjs';
import { lessonPaths } from './lessons.mjs';
import { projectFolder, sessionFiles, promptMessages, toolCalls, typedPrompt } from './sessions.mjs';

export { entryOf, clusters, MIN_SESSIONS };

const MAX_PROMPT_CHARS = 600;
const MAX_FLAG_CHARS = 80;
const MAX_CANDIDATES = 15;
const MIN_FLAG_WORDS = 4;
const INTERRUPT_MARK = '[Request interrupted';
const LOCK_WAIT_MS = environmentMs('EXO_LEARN_LOCK_MS', 2000);
const USAGE = 'usage: node corrections.mjs hook | session-start | backfill [--cwd <dir>] | candidates [--texts] [--cwd <dir>] | keep <id...> [--cwd <dir>] | reject <id...> [--cwd <dir>] | recount [--cwd <dir>]';
const FLAGS = { cwd: 'string', texts: 'boolean', help: 'boolean' };

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

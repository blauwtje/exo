import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { sleepSync } from '#basics';
import { configDirectory } from '#config-directory';
import { scratchPath } from '#scratch-path';
import { projectFolder } from './sessions.mjs';

export const MAX_ENTRIES = 2000;
const MAX_SEEN_MARKS = 50;
const STALE_LOCK_MS = 10_000;
const LOCK_RETRY_MS = 50;
const FOLDER_MODE = 0o700;
export const FILE_MODE = 0o600;
const PROJECT_LEDGER = /^[A-Za-z0-9-]+\.jsonl$/;
export const VERDICTS = { keep: 'kept', reject: 'rejected' };
export const BUSY = Symbol('busy');
const UNWRITABLE = ['EPERM', 'EACCES', 'EROFS'];
const UNREADABLE = ['EPERM', 'EACCES'];

let fallbackStore = false;

function ledgerName(cwd) {
  return `${path.basename(projectFolder(cwd))}.jsonl`;
}

function configLedger(cwd) {
  return path.join(configDirectory(), 'exo', 'learn', ledgerName(cwd));
}

function fallbackLedger(cwd) {
  return path.join(scratchPath(cwd, 'learn'), ledgerName(cwd));
}

export function ledgerFile(cwd) {
  return fallbackStore ? fallbackLedger(cwd) : configLedger(cwd);
}

function readableLedgers(cwd) {
  return fallbackStore ? [configLedger(cwd), fallbackLedger(cwd)] : [configLedger(cwd)];
}

export function verdictsOf(ledger) {
  return ledger.replace(/\.jsonl$/, '.verdicts.jsonl');
}

export function verdictsFile(cwd) {
  return verdictsOf(ledgerFile(cwd));
}

export function failuresOf(ledger) {
  return ledger.replace(/\.jsonl$/, '.failures.jsonl');
}

export function failuresFile(cwd) {
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

export function writePrivate(file, text) {
  ensureFolder(file);
  fs.writeFileSync(file, text, { mode: FILE_MODE });
  fs.chmodSync(file, FILE_MODE);
}

export function append(file, objects) {
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

export function waitLocked(cwd, work, waitMs = Infinity) {
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

export function ledgerOf(rows) {
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

export function verdictRows(file) {
  return rowsIn(file).filter((row) => isRepeatedRow(row) || (Object.values(VERDICTS).includes(row?.verdict) && (Array.isArray(row.ids) || Array.isArray(row.words))));
}

export function readVerdicts(cwd) {
  return readableLedgers(cwd).map(verdictsOf).flatMap(verdictRows);
}

function isRepeatedRow(row) {
  return typeof row?.repeated === 'string';
}

export function isFailedRow(row) {
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

export function isKnownRow(row) {
  return row !== null && ROW_KINDS.some((kind) => kind(row));
}

export function cacheRows(cwd) {
  const texts = readableLedgers(cwd).filter((file) => fs.existsSync(file)).map(readText).filter((text) => text !== null);
  if (texts.length === 0) return null;
  const lines = texts.flatMap((text) => text.slice(0, text.lastIndexOf('\n') + 1).split('\n').filter((row) => row !== ''));
  return rowsOf((fallbackStore ? [...new Set(lines)] : lines).join('\n'));
}

export function appendRows(file, rows) {
  const bytes = fs.existsSync(file) ? fs.readFileSync(file) : Buffer.alloc(0);
  if (bytes.length > 0 && bytes.at(-1) !== 0x0a) fs.truncateSync(file, bytes.lastIndexOf(0x0a) + 1);
  append(file, rows);
}

export function entryRows(file) {
  return rowsIn(file).filter((row) => row !== null && isEntryRow(row));
}

export function readFailures(cwd) {
  const rows = readableLedgers(cwd).map(failuresOf).flatMap(entryRows);
  return [...new Map(rows.map((row) => [row.id, row])).values()];
}

export function currentLedger(cwd) {
  const rows = cacheRows(cwd);
  return rows !== null && rows.every(isKnownRow) ? ledgerOf(rows) : null;
}

function reset(cwd) {
  const rows = cacheRows(cwd);
  if (rows === null || rows.every(isKnownRow)) return;
  for (const name of [ledgerFile(cwd), countFile(cwd), `${ledgerFile(cwd)}.shown.json`]) fs.rmSync(name, { force: true });
}

export function loadOrReset(cwd) {
  const ledger = currentLedger(cwd);
  if (ledger === null) {
    reset(cwd);
    return null;
  }
  return { ...ledger, verdicts: readVerdicts(cwd) };
}

export function indexed(rows) {
  return rows.map((row) => ({ ...row, words: new Set(row.words) }));
}

function compacted(ledger) {
  if (ledger.entries.length <= MAX_ENTRIES) return ledger;
  return { ...ledger, seen: ledger.seen.slice(-MAX_SEEN_MARKS), entries: ledger.entries.slice(-MAX_ENTRIES) };
}

export function rewrite(file, rows) {
  const temp = `${file}.${process.pid}.tmp`;
  writePrivate(temp, rows.map((row) => `${JSON.stringify(row)}\n`).join(''));
  fs.renameSync(temp, file);
}

export function ledgerRows(ledger) {
  return [...ledger.seen, ...ledger.flagged, ...ledger.entries];
}

export function compact(cwd) {
  const ledger = currentLedger(cwd);
  if (ledger === null) return;
  const kept = compacted(ledger);
  if (kept !== ledger) rewrite(ledgerFile(cwd), ledgerRows(kept));
}

export function countFile(cwd) {
  return `${ledgerFile(cwd)}.count`;
}

export function otherLedgers(cwd) {
  if (fallbackStore) return [];
  const folder = path.dirname(configLedger(cwd));
  return fs.readdirSync(folder).filter((name) => PROJECT_LEDGER.test(name) && name !== ledgerName(cwd)).map((name) => path.join(folder, name));
}

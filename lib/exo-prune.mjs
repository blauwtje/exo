import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const FALLBACK_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;
const CATALOG = new URL('./run-providers.json', import.meta.url);
const CONTAINERS = new Set(['kept', 'run-plan', 'logs']);
const STAMP = '.exo/pruned-at';
const NEVER_PRUNED = new Set(['run', path.basename(STAMP)]);

const isDays = (value) => Number.isInteger(value) && value > 0;

function readDays(file) {
  try {
    const value = JSON.parse(fs.readFileSync(file, 'utf8')).defaults?.pruneAfterDays;
    return isDays(value) ? value : null;
  } catch {
    return null;
  }
}

export function pruneAfterDays(home = os.homedir()) {
  return readDays(path.join(home, '.config', 'exo', 'run.json')) ?? readDays(CATALOG) ?? FALLBACK_DAYS;
}

function lstatOrNull(target) {
  return fs.lstatSync(target, { throwIfNoEntry: false }) ?? null;
}

function newestFileModified(target, stat) {
  if (stat.isFile()) return stat.mtimeMs;
  if (!stat.isDirectory()) return -Infinity;
  const ages = fs.readdirSync(target).map((name) => {
    const child = path.join(target, name);
    return newestFileModified(child, fs.lstatSync(child));
  });
  return Math.max(-Infinity, ...ages);
}

function newestModified(target, stat) {
  const newest = newestFileModified(target, stat);
  return newest === -Infinity ? stat.mtimeMs : newest;
}

function newestProgressFolder(exoDirectory, entries) {
  let newest = null;
  for (const { name } of entries.filter((entry) => entry.isDirectory())) {
    const stat = lstatOrNull(path.join(exoDirectory, name, 'progress.md'));
    if (stat === null || !stat.isFile()) continue;
    if (newest === null || stat.mtimeMs > newest.modified) newest = { name, modified: stat.mtimeMs };
  }
  return newest?.name ?? null;
}

function childrenOf(directory) {
  return fs.readdirSync(directory).map((name) => path.join(directory, name));
}

function pruneUnits(exoDirectory) {
  const entries = fs.readdirSync(exoDirectory, { withFileTypes: true });
  const protectedName = newestProgressFolder(exoDirectory, entries);
  const units = [];
  for (const { name } of entries) {
    if (NEVER_PRUNED.has(name) || name === protectedName) continue;
    const entry = path.join(exoDirectory, name);
    const isContainer = CONTAINERS.has(name) && lstatOrNull(entry)?.isDirectory();
    if (isContainer) units.push(...childrenOf(entry));
    else units.push(entry);
  }
  return units;
}

function stampBlocks(stamp, now) {
  const stat = lstatOrNull(stamp);
  if (stat === null) return false;
  return stat.isSymbolicLink() || now - stat.mtimeMs < DAY_MS;
}

function writeStamp(stamp, now) {
  fs.writeFileSync(stamp, '');
  fs.utimesSync(stamp, now / 1000, now / 1000);
}

function removeStale(unit, cutoff) {
  const stat = lstatOrNull(unit);
  if (stat === null || stat.isSymbolicLink()) return false;
  if (newestModified(unit, stat) >= cutoff) return false;
  fs.rmSync(unit, { recursive: true, force: true });
  return true;
}

export function pruneExo({ cwd, now = Date.now(), home = os.homedir() }) {
  const removed = [];
  try {
    const exoDirectory = path.join(cwd, '.exo');
    const exoStat = lstatOrNull(exoDirectory);
    if (exoStat === null || !exoStat.isDirectory()) return removed;
    const stamp = path.join(cwd, STAMP);
    if (stampBlocks(stamp, now)) return removed;
    const cutoff = now - pruneAfterDays(home) * DAY_MS;
    removed.push(...pruneUnits(exoDirectory).filter((unit) => removeStale(unit, cutoff)));
    writeStamp(stamp, now);
  } catch {
    return removed;
  }
  return removed;
}

import fs from 'node:fs';
import path from 'node:path';
import { parseLine } from '#basics';

const LEDGER = 'done.jsonl';

function entriesOf(out) {
  const file = path.join(out, LEDGER);
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split('\n').map(parseLine).filter((entry) => entry !== null);
}

export function findDone(out, key) {
  const entry = entriesOf(out).findLast((candidate) => candidate.key === key);
  if (!entry || !fs.existsSync(path.join(out, entry.transcript))) return null;
  return entry;
}

export function markDone(out, key, { line, transcript, route, timings }) {
  fs.mkdirSync(out, { recursive: true });
  const entry = { key, transcript: path.relative(out, transcript), line, route, timings };
  fs.appendFileSync(path.join(out, LEDGER), `${JSON.stringify(entry)}\n`);
}

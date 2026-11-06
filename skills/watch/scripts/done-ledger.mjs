import fs from 'node:fs';
import path from 'node:path';

const LEDGER = 'done.jsonl';

function entriesOf(out) {
  const file = path.join(out, LEDGER);
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split('\n').flatMap((line) => {
    try {
      return [JSON.parse(line)];
    } catch {
      return [];
    }
  });
}

export function findDone(out, key) {
  const entry = entriesOf(out).findLast((candidate) => candidate.key === key);
  if (!entry || !fs.existsSync(path.join(out, entry.transcript))) return null;
  return entry;
}

export function markDone(out, key, { line, transcript }) {
  fs.mkdirSync(out, { recursive: true });
  const entry = { key, transcript: path.relative(out, transcript), line };
  fs.appendFileSync(path.join(out, LEDGER), `${JSON.stringify(entry)}\n`);
}

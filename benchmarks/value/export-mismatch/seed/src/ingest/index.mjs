import fs from 'node:fs';
import path from 'node:path';
import { parseCardsvc } from './cardsvc.mjs';
import { parseLedger } from './ledger.mjs';

const SOURCES = [
  { name: 'cardsvc', extension: 'jsonl', parse: parseCardsvc },
  { name: 'ledger', extension: 'csv', parse: parseLedger }
];

// Every row of the month from both sources, card events first.
export function loadMonth(dataDir, month) {
  return SOURCES.flatMap(({ name, extension, parse }) => {
    const file = path.join(dataDir, 'sources', name, `${month}.${extension}`);
    return parse(fs.readFileSync(file, 'utf8'));
  });
}

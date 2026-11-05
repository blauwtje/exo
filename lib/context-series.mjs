import fs from 'node:fs';
import { parseLine, usageTokens } from './context-decisions.mjs';

export function contextSeries(file) {
  const entries = fs.readFileSync(file, 'utf8').split('\n').map(parseLine).filter(Boolean);
  return entries.map((entry) => ({ tokens: usageTokens(entry), entry }));
}

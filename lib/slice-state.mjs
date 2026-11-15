import fs from 'node:fs';
import { tmpStateFile } from './basics.mjs';

export function researchAgeMs(sessionId) {
  try {
    return Date.now() - fs.statSync(tmpStateFile('research', sessionId)).mtimeMs;
  } catch {
    return Infinity;
  }
}

export function recordResearch(sessionId) {
  fs.writeFileSync(tmpStateFile('research', sessionId), '.');
}

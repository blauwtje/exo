// The tail reader of a transcript: the context size of its last assistant turn,
// the input, cache read and cache creation tokens, because a model cannot see
// its own context size. Shared by context-watch.mjs (the main session) and
// delegate-budget.mjs (one delegate), which runs its guard on import.

import fs from 'node:fs';
import { usageCounts } from './token-weights.mjs';

// One assistant line is small unless it carries a large tool input, so the tail
// read widens only when it holds no complete usage line.
const TAIL_BYTES = 256 * 1024;

export function readText(descriptor, start, length) {
  const buffer = Buffer.alloc(length);
  const bytesRead = fs.readSync(descriptor, buffer, 0, length, start);
  return buffer.toString('utf8', 0, bytesRead);
}

// The line being written when the hook runs may be cut off mid-JSON.
export function parsedEntry(line) {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

// Null when no complete assistant usage line that `counts` accepts exists, such
// as before the first turn or when the only one is still being written.
export function contextTokens(descriptor, size, counts = () => true) {
  for (let want = TAIL_BYTES; ; want *= 4) {
    const start = Math.max(size - want, 0);
    const lines = readText(descriptor, start, size - start).split('\n');
    // A tail that starts inside the file opens on a partial line.
    const firstWhole = start === 0 ? 0 : 1;
    for (let index = lines.length - 1; index >= firstWhole; index -= 1) {
      if (!lines[index].includes('"usage"')) continue;
      const entry = parsedEntry(lines[index]);
      const usage = entry?.type === 'assistant' && counts(entry) ? entry.message?.usage : null;
      if (!usage) continue;
      const tokens = usageCounts(usage);
      return tokens.input + tokens.cacheRead + tokens.cache5m + tokens.cache1h;
    }
    if (start === 0) return null;
  }
}

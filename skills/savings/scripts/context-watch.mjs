#!/usr/bin/env node
// Tells the main session when its context has passed the `context` setting,
// at the moment a phase can move to a fresh context: a task marked completed.
// The model cannot see its own context size and the transcript carries no
// window size, so the figure is absolute: the input, cache read and cache
// creation tokens of the last main-thread assistant turn. Under the threshold
// it prints nothing. A delegate carries `agent_id` and holds a context of its
// own, so it is never measured.
//
//   node context-watch.mjs   PostToolUse hook on TaskUpdate: stdin is the hook JSON
//
// A fault never blocks the tool call: any error exits 0 with nothing on stdout.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { usageCounts } from './token-weights.mjs';

const SETTINGS = fileURLToPath(new URL('../../settings/scripts/settings.mjs', import.meta.url));
const SCHEMA = JSON.parse(fs.readFileSync(new URL('../../settings/schema.json', import.meta.url), 'utf8'));
const ADVICE = 'the next phase runs in a delegate, or hands off when it asks the user';

// settings.mjs already reads an invalid stored value as the default; a lookup
// that fails outright, such as on a project file that is not JSON, does the same.
function thresholdThousands() {
  const lookup = spawnSync(process.execPath, [SETTINGS, 'get', 'context'], { encoding: 'utf8' });
  const value = Number(lookup.stdout.trim());
  if (lookup.status !== 0 || !Number.isSafeInteger(value) || value < 1) return SCHEMA.context.default;
  return value;
}

// The line being written when the hook runs may be cut off mid-JSON.
function parsedEntry(line) {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

// The whole file is read because one JSONL line can run to megabytes, so no
// fixed tail is sure to hold a whole assistant line.
function contextTokens(transcriptPath) {
  const lines = fs.readFileSync(transcriptPath, 'utf8').split('\n');
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (!lines[index].includes('"usage"')) continue;
    const entry = parsedEntry(lines[index]);
    if (entry === null || entry.type !== 'assistant' || entry.isSidechain === true) continue;
    const usage = entry.message?.usage;
    if (!usage) continue;
    const counts = usageCounts(usage);
    return counts.input + counts.cacheRead + counts.cache5m + counts.cache1h;
  }
  return 0;
}

function watch(hookInput) {
  if (typeof hookInput.agent_id === 'string') return;
  if (hookInput.tool_input?.status !== 'completed') return;
  if (typeof hookInput.transcript_path !== 'string') return;
  const tokens = contextTokens(hookInput.transcript_path);
  const threshold = thresholdThousands();
  if (tokens <= threshold * 1000) return;
  const additionalContext = `exo: context ${Math.round(tokens / 1000)}k tokens, past ${threshold}k: ${ADVICE}`;
  const hookSpecificOutput = { hookEventName: 'PostToolUse', additionalContext };
  process.stdout.write(`${JSON.stringify({ hookSpecificOutput })}\n`);
}

try {
  watch(JSON.parse(fs.readFileSync(0, 'utf8')));
} catch (error) {
  console.error(`context-watch: ${error.message}`);
}

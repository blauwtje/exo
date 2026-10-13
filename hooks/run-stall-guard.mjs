#!/usr/bin/env node

import path from 'node:path';
import process from 'node:process';
import { readHookText } from '#hook-input';
import { environmentMs, isMain } from '../lib/script-flags.mjs';

const PLUGIN_ROOT = path.resolve(import.meta.dirname, '..');
const GUARD = path.join(PLUGIN_ROOT, 'lib', 'stall-guard.mjs');

export const shellQuote = (text) => `'${String(text).replaceAll("'", "'\\''")}'`;

const runsExoScript = (command) => [`node "${PLUGIN_ROOT}${path.sep}`, `node ${PLUGIN_ROOT}${path.sep}`].some((start) => command.startsWith(start));

export function stallGuardInput(input) {
  if (input?.tool_name !== 'Bash') return null;
  const command = input.tool_input?.command;
  if (typeof command !== 'string' || command.trim() === '' || runsExoScript(command.trim())) return null;
  const cap = environmentMs('BASH_MAX_TIMEOUT_MS', 600_000);
  const asked = Number(input.tool_input.timeout);
  const timeout = Number.isFinite(asked) && asked > 0 ? Math.min(asked, cap) : cap;
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      updatedInput: { ...input.tool_input, command: `node "${GUARD}" -- ${shellQuote(command)}`, timeout }
    }
  };
}

async function hookOutput() {
  try {
    return stallGuardInput(JSON.parse(await readHookText()));
  } catch {
    return null;
  }
}

if (isMain(import.meta.url)) {
  const output = await hookOutput();
  if (output) process.stdout.write(`${JSON.stringify(output)}\n`);
}

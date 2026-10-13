#!/usr/bin/env node

import path from 'node:path';
import process from 'node:process';
import { readHookText } from '#hook-input';
import { isMain } from '../lib/script-flags.mjs';

export const MAX_TIMEOUT_MS = 600000;

const PLUGIN_ROOT = path.resolve(import.meta.dirname, '..');
const GUARD = path.join(PLUGIN_ROOT, 'lib', 'stall-guard.mjs');

export const shellQuote = (text) => `'${String(text).replaceAll("'", "'\\''")}'`;

const runsExoScript = (command) => [`node "${PLUGIN_ROOT}${path.sep}`, `node ${PLUGIN_ROOT}${path.sep}`].some((start) => command.startsWith(start));

export function stallGuardInput(input) {
  if (input?.tool_name !== 'Bash') return null;
  const command = input.tool_input?.command;
  if (typeof command !== 'string' || command.trim() === '' || runsExoScript(command.trim())) return null;
  const asked = Number(input.tool_input.timeout);
  const timeout = Number.isFinite(asked) && asked > 0 ? Math.min(asked, MAX_TIMEOUT_MS) : MAX_TIMEOUT_MS;
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

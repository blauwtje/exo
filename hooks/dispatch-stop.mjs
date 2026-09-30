#!/usr/bin/env node
// The one Stop hook process: runs proof-check, resume-plan and
// terse-check in that order on the same input, each in its own try/catch so a
// fault in one never stops the rest, and writes one hook output object. The
// first block wins, and proof-check comes before resume-plan, which is skipped
// once proof-check blocks, so a turn with no proof is told so and resume-plan
// keeps its wait marker for a later turn. Every other handler runs, because
// terse-check keeps state on disk. A fault reading the input exits
// 0 with no output.

import process from 'node:process';
import { readHookText } from '#hook-input';
import { stopHook as proofCheck } from '../skills/build/scripts/proof-check.mjs';
import { stopHook as resumePlan } from '../skills/build/scripts/resume-plan.mjs';
import { stopHook as terseCheck } from '../skills/configure/scripts/terse-check.mjs';
import { isProcessEntry } from './guards/guard-runner.mjs';

const HANDLERS = [
  ['proof-check', proofCheck],
  ['resume-plan', resumePlan],
  ['terse-check', terseCheck]
];

// The hook output object of the first handler that blocks, or null to let the turn end.
export function dispatchStop(input) {
  let block = null;
  for (const [name, handler] of HANDLERS) {
    if (name === 'resume-plan' && block !== null) continue;
    try {
      const output = handler(input);
      if (block === null && output) block = output;
    } catch (error) {
      // A handler fault never blocks a turn or stops the handlers after it.
      console.error(`${name}: ${error.message}`);
    }
  }
  return block;
}

if (isProcessEntry(import.meta.url)) {
  try {
    const block = dispatchStop(JSON.parse((await readHookText()) || '{}'));
    if (block !== null) process.stdout.write(`${JSON.stringify(block)}\n`);
  } catch {
    // Unreadable input leaves nothing to check.
  }
}

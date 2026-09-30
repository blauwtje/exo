#!/usr/bin/env node
// The one Stop hook process: runs savings, proof-check, resume-plan and
// terse-check in that order on the same input, each in its own try/catch so a
// fault in one never stops the rest, and writes one hook output object. Every
// handler runs, because resume-plan consumes its wait marker and savings and
// terse-check keep state on disk; the first block wins, and proof-check comes
// before resume-plan, so a turn with no proof is told so before it is told to
// continue the plan. A fault reading the input exits 0 with no output.

import process from 'node:process';
import { readHookText } from '#hook-input';
import { stopHook as proofCheck } from '../skills/build/scripts/proof-check.mjs';
import { stopHook as resumePlan } from '../skills/build/scripts/resume-plan.mjs';
import { stopHook as terseCheck } from '../skills/configure/scripts/terse-check.mjs';
import { stopHook as savings } from '../skills/show-savings/scripts/savings.mjs';
import { isProcessEntry } from './guards/guard-runner.mjs';

const HANDLERS = [savings, proofCheck, resumePlan, terseCheck];

// The hook output object of the first handler that blocks, or null to let the turn end.
export function dispatchStop(input) {
  let block = null;
  for (const handler of HANDLERS) {
    try {
      const output = handler(input);
      if (block === null && output) block = output;
    } catch {
      // A handler fault never blocks a turn or stops the handlers after it.
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

// Decisions a run takes on its own: one line each in `<EXO_RUN_DIR>/decisions.md`.
// Imported as `#run-decision`; run as `node lib/run-decision.mjs <source> <choice> <reason>`
// it records one line and exits 0, or exits 1 outside a run.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { isMain } from './script-flags.mjs';

export function inRun(env = process.env) {
  return Boolean(env.EXO_RUN && env.EXO_RUN_DIR);
}

export function recordDecision(source, choice, reason, env = process.env) {
  if (!inRun(env)) return null;
  const file = path.join(env.EXO_RUN_DIR, 'decisions.md');
  fs.mkdirSync(env.EXO_RUN_DIR, { recursive: true });
  fs.appendFileSync(file, `- ${source}: ${choice} (${reason})\n`);
  return file;
}

export function readDecisions(runDir) {
  try {
    return fs.readFileSync(path.join(runDir, 'decisions.md'), 'utf8').split('\n').filter(Boolean);
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

if (isMain(import.meta.url)) {
  const [source, choice, reason] = process.argv.slice(2);
  process.exit(recordDecision(source, choice, reason) ? 0 : 1);
}

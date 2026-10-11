#!/usr/bin/env node
// benchmarks/confined-child.mjs
// The `claude` that `exo run --claude` starts in a flow-run sweep cell. exo run
// itself runs outside the sandbox, so each session it starts passes through
// here and runs confined to the cell root named by EXO_SWEEP_CELL_ROOT, the
// way sweep.mjs confines a plain cell. Prompt and output ride stdin and stdout.
// It refuses to start without a cell root or outside it, never unconfined.

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { confinedClaude } from '#confine-claude';

function main() {
  const root = process.env.EXO_SWEEP_CELL_ROOT;
  if (!root) throw new Error('EXO_SWEEP_CELL_ROOT names no cell root; refusing to start claude unconfined');
  const cellRoot = fs.realpathSync(root);
  const cwd = fs.realpathSync(process.cwd());
  if (cwd !== cellRoot && !cwd.startsWith(cellRoot + path.sep)) throw new Error(`${cwd} is outside the cell root ${cellRoot}`);
  const tmp = path.join(cellRoot, 'tmp');
  fs.mkdirSync(tmp, { recursive: true });
  const run = confinedClaude({ args: process.argv.slice(2), roots: [cellRoot], cwd, tmp });
  const child = spawn(run.command, run.args, { cwd: run.cwd, env: { ...process.env, ...run.env }, stdio: 'inherit' });
  child.on('close', (code, signal) => process.exit(code ?? (signal === null ? 1 : 128)));
}

try {
  main();
} catch (error) {
  console.error(`confined-child: ${error.message}`);
  process.exit(1);
}

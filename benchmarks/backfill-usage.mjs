#!/usr/bin/env node
// benchmarks/backfill-usage.mjs
// Writes usage.json for every cell of a runs directory that lacks one, from
// the cell's transcripts while they survive under the Claude config directory.
// run.mjs writes it as each cell ends; this serves runs from before it did.
//
//   node benchmarks/backfill-usage.mjs benchmarks/runs/<dir>

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { writeCellUsage } from './cell-usage.mjs';
import { readJson } from './basics.mjs';
import { filesNamed } from './tree-files.mjs';

function usageLackingByRole(cellDirectory) {
  const usageFile = path.join(cellDirectory, 'usage.json');
  if (!fs.existsSync(usageFile)) return {};
  const old = readJson(usageFile);
  return old.byRole === undefined ? old : null;
}

function main() {
  if (!process.argv[2]) throw new Error('usage: backfill-usage.mjs <runs directory>');
  const runsDirectory = path.resolve(process.argv[2]);
  let written = 0;
  const missing = [];
  for (const file of filesNamed(runsDirectory, 'result.json').sort()) {
    const cellDirectory = path.join(runsDirectory, path.dirname(file));
    const old = usageLackingByRole(cellDirectory);
    if (old === null) continue;
    const result = readJson(path.join(cellDirectory, 'result.json'));
    const usage = typeof result.session_id === 'string' ? writeCellUsage(cellDirectory, result.session_id) : null;
    if (usage === null) missing.push(path.dirname(file));
    else {
      if (Object.keys(old).length > 0) fs.writeFileSync(path.join(cellDirectory, 'usage.json'), `${JSON.stringify({ ...old, byRole: old.sessions === undefined ? usage.byRole : null }, null, 2)}\n`);
      written += 1;
    }
  }
  console.log(`usage.json written for ${written} cells`);
  if (missing.length > 0) console.log(`no transcript left for ${missing.length} cells: ${missing.join(', ')}`);
}

try {
  main();
} catch (error) {
  console.error(`backfill-usage: ${error.message}`);
  process.exit(1);
}

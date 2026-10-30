#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const repo = path.resolve(process.argv[2] ?? '');
if (!process.argv[2] || !fs.existsSync(path.join(repo, '.git'))) {
  console.error('usage: node setup.mjs <repoDir>');
  process.exit(2);
}

const result = `# Orchestrate: ledger

## Phase 1
- negative-amount: phase 1, DONE. Worker return: "DONE negative-amount. Proof: npm test → tests 3, pass 3, fail 0. src/parse.mjs:3 throws RangeError('negative amount') when the amount is below 0."

## Phase 2 (next)
- totals: phase 2, not started. Add \`totalOf(lines)\` to \`src/totals.mjs\`: the sum of \`parseAmount\` over every non-blank line, a parse error passing through. Needs negative-amount. Add a test.

Remains: phase 2.
`;

fs.mkdirSync(path.join(repo, '.exo', 'orchestrate'), { recursive: true });
fs.writeFileSync(path.join(repo, '.exo', 'orchestrate', 'result.md'), result);

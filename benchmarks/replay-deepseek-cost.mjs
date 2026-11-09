#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { usageCost } from './pricing.mjs';
const root = process.argv[2];
let before = 0, off = 0, peak = 0, cells = 0;
for (const set of fs.readdirSync(root)) {
  const dir = path.join(root, set);
  if (!fs.statSync(dir).isDirectory()) continue;
  for (const cell of fs.readdirSync(dir)) {
    const file = path.join(dir, cell, 'stdout.json');
    if (!fs.existsSync(file) || fs.statSync(file).size === 0) continue;
    const text = fs.readFileSync(file, 'utf8').trim();
    const last = JSON.parse(text.startsWith('[') ? text : text.split('\n').at(-1));
    const result = Array.isArray(last) ? last.at(-1) : last;
    const byModel = {};
    for (const [m, u] of Object.entries(result.modelUsage ?? {})) byModel[m] = { input: u.inputTokens, cacheRead: u.cacheReadInputTokens, cache5m: u.cacheCreationInputTokens, cache1h: 0, output: u.outputTokens };
    before += result.total_cost_usd ?? 0;
    off += usageCost(byModel, Date.UTC(2026, 10, 8, 12)).costUsd;
    peak += usageCost(byModel, Date.UTC(2026, 10, 9, 9)).costUsd;
    cells++;
  }
}
console.log(JSON.stringify({ cells, beforeUsd: +before.toFixed(3), afterOffPeakUsd: +off.toFixed(3), afterPeakUsd: +peak.toFixed(3) }));

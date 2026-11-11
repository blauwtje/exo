import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CASES, extraLimitMs, timeCase } from './hook-timing.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SAMPLES = 20;
const IMPORT_PATTERN = /(?:from\s+|import\s*\(\s*|import\s+)["']([.#][^"']+)["']/g;
const SESSION_INPUT = '{"hook_event_name":"SessionStart","source":"startup"}';

const BASELINE_PATH = new URL('./results/lean-guards-baseline.json', import.meta.url);
const FIGURES = ['bytes', 'modules', 'hookMs'];

export function compareFigures(baseline, current) {
  return FIGURES.map((figure) => ({
    figure,
    baseline: baseline[figure],
    current: current[figure],
    delta: current[figure] - baseline[figure],
    ok: current[figure] <= baseline[figure],
  }));
}

export function measureBytes() {
  const output = execFileSync(process.execPath, [path.join(ROOT, 'hooks', 'session-start.mjs')], {
    input: SESSION_INPUT,
    env: { ...process.env, CLAUDE_PLUGIN_ROOT: ROOT },
    timeout: 60000,
  });
  return output.length;
}

export function measureModules() {
  const aliases = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')).imports ?? {};
  const seen = new Set();
  const resolve = (from, spec) =>
    spec.startsWith('#') ? aliases[spec] && path.resolve(ROOT, aliases[spec]) : path.resolve(path.dirname(from), spec);
  const walk = (file) => {
    if (!file || seen.has(file) || !existsSync(file)) return;
    seen.add(file);
    for (const match of readFileSync(file, 'utf8').matchAll(IMPORT_PATTERN)) walk(resolve(file, match[1]));
  };
  const hooks = path.join(ROOT, 'hooks');
  for (const name of readdirSync(hooks).filter((entry) => entry.endsWith('.mjs'))) walk(path.join(hooks, name));
  return seen.size;
}

export function measureHookMs() {
  return Math.max(...CASES.map((timing) => timeCase(timing, SAMPLES)));
}

function main(currentPath) {
  const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
  const current = currentPath
    ? JSON.parse(readFileSync(currentPath, 'utf8'))
    : { bytes: measureBytes(), modules: measureModules(), hookMs: measureHookMs() };
  const rows = compareFigures(baseline, current);
  const limit = extraLimitMs();
  for (const row of rows) {
    if (!currentPath && row.figure === 'hookMs') {
      const ok = row.current <= limit;
      console.log(`${ok ? 'OK' : 'WORSE'} hookMs ${row.baseline} -> ${row.current.toFixed(1)} (worse only above the ${limit} ms hook-timing limit)`);
      row.ok = ok;
      continue;
    }
    console.log(`${row.ok ? 'OK' : 'WORSE'} ${row.figure} ${row.baseline} -> ${row.current} (${row.delta})`);
  }
  return rows.every((row) => row.ok) ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv[2]));
}

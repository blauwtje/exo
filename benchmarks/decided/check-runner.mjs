import { spawnSync } from 'node:child_process';

const MODES = ['default', 'alternative'];
const DETAIL_TAIL = 400;

export function runHiddenCheck(repo, mode) {
  if (!MODES.includes(mode)) throw new Error(`mode must be default or alternative, got ${mode}`);
  const run = spawnSync(process.execPath, ['hidden-check.mjs'], { cwd: repo, encoding: 'utf8' });
  const pass = run.status === 0;
  const detail = pass ? [] : [`${mode}: ${(run.stderr || run.stdout).trim().slice(-DETAIL_TAIL)}`];
  console.log(JSON.stringify({ pass, defects: pass ? 0 : 1, total: 1, detail }));
}

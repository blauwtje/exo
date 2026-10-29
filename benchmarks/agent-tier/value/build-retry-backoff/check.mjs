import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const taskDir = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(process.argv[2] ?? '.');
const hiddenFiles = readdirSync(path.join(taskDir, 'hidden', '__check__'))
  .filter((name) => name.endsWith('.test.mjs'))
  .map((name) => path.join('__check__', name));

function countTests(file) {
  const text = readFileSync(path.join(taskDir, 'hidden', file), 'utf8');
  return (text.match(/^test\(/gm) ?? []).length;
}

function hiddenFindings() {
  const expected = hiddenFiles.reduce((sum, file) => sum + countTests(file), 0);
  const run = spawnSync(process.execPath, ['--test', '--test-reporter=tap', ...hiddenFiles], {
    cwd: repo,
    encoding: 'utf8',
    timeout: 30000,
  });
  const tap = run.stdout ?? '';
  const passed = (tap.match(/^ok \d+ - /gm) ?? []).length;
  const failed = [...tap.matchAll(/^not ok \d+ - (.+?)(?: # .*)?$/gm)].map((match) => match[1]);
  const detail = failed.slice(0, 12).map((name) => `hidden test failed: ${name}`);
  return { total: expected, defects: Math.max(expected - passed, 0), detail };
}

function suiteFinding() {
  const run = spawnSync('npm', ['test', '--silent'], { cwd: repo, encoding: 'utf8', timeout: 60000 });
  if (run.status === 0) return { total: 1, defects: 0, detail: [] };
  return { total: 1, defects: 1, detail: [`npm test exits ${run.status}`] };
}

const findings = [hiddenFindings(), suiteFinding()];
const defects = findings.reduce((sum, finding) => sum + finding.defects, 0);
const total = findings.reduce((sum, finding) => sum + finding.total, 0);
const detail = findings.flatMap((finding) => finding.detail);
process.stdout.write(`${JSON.stringify({ pass: defects === 0, defects, total, detail })}\n`);

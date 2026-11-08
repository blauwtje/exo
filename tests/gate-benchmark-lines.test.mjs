import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { parsePlan } from '../lib/plan-tasks.mjs';
import { benchmarkLines } from '../skills/gate/scripts/benchmark-lines.mjs';

const HEADER = '| cell | a | b | c | d | tokens | wall | cost | detail |\n|---|---|---|---|---|---|---|---|---|\n';

function table(costs) {
  const rows = costs.map((cost) => `| flow | 1 | 2 | 3 | 4 | 100 | 10 | $${cost} | hidden check pass, 3/3 Plan-task trailers |`);
  return HEADER + rows.join('\n') + '\n';
}

function planText(extra) {
  return `# Plan\n\n## Success criterion\n\n\`npm run check\`\nBaseline: base.md @ BASE\n${extra}\n\n### Task 1: feat(x): y\n\nFiles: \`a.mjs\`\n`;
}

function git(root, ...args) {
  return execFileSync('git', ['-C', root, '-c', 'user.name=T', '-c', 'user.email=t@example.com', ...args], { encoding: 'utf8' }).trim();
}

function fixture({ candidateCosts, specOverride = '' }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-'));
  git(root, 'init', '-q');
  fs.writeFileSync(path.join(root, 'base.md'), table([1, 1.01, 0.99, 1]));
  git(root, 'add', '.');
  git(root, 'commit', '-qm', 'base');
  const base = git(root, 'rev-parse', 'HEAD');
  fs.writeFileSync(path.join(root, 'plan.md'), planText(specOverride).replace('BASE', base));
  git(root, 'add', '.');
  git(root, 'commit', '-qm', 'plan');
  fs.mkdirSync(path.join(root, 'benchmarks/results'), { recursive: true });
  fs.writeFileSync(path.join(root, 'benchmarks/results/2026-01-01-sweep.md'), table(candidateCosts));
  return { root, base };
}

function lines(root, base, override) {
  const text = planText(override).replace('BASE', base);
  return benchmarkLines(parsePlan(text), { root, planPath: 'plan.md' });
}

test('a rise beyond the noise bound fails the benchmark', () => {
  const { root, base } = fixture({ candidateCosts: [2, 2.01, 1.99, 2] });
  assert.match(lines(root, base, '')[0], /^FAIL benchmark \(regression/);
});

test('a flat candidate passes', () => {
  const { root, base } = fixture({ candidateCosts: [1, 1.01, 0.99, 1] });
  assert.deepEqual(lines(root, base, ''), ['PASS benchmark']);
});

test('an override present at the spec commit waives the block', () => {
  const override = 'Benchmark-override: known cost';
  const { root, base } = fixture({ candidateCosts: [2, 2.01, 1.99, 2], specOverride: override });
  assert.deepEqual(lines(root, base, override), ['WARN benchmark override (known cost)']);
});

test('an override added after the spec commit is ignored and reported', () => {
  const { root, base } = fixture({ candidateCosts: [2, 2.01, 1.99, 2] });
  const result = lines(root, base, 'Benchmark-override: late');
  assert.match(result[0], /^FAIL benchmark/);
  assert.equal(result[1], 'WARN benchmark override ignored (added after the run started)');
});

test('a malformed Baseline line fails as unmeasured', () => {
  const { root } = fixture({ candidateCosts: [1, 1, 1, 1] });
  const text = planText('').replace('Baseline: base.md @ BASE', 'Baseline: nonsense');
  const out = benchmarkLines(parsePlan(text), { root, planPath: 'plan.md' });
  assert.match(out[0], /^FAIL benchmark \(unmeasured: malformed Baseline line\)/);
});

test('an unreachable baseline commit fails as unmeasured instead of crashing', () => {
  const { root } = fixture({ candidateCosts: [1, 1, 1, 1] });
  const out = lines(root, 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef', '');
  assert.match(out[0], /^FAIL benchmark \(unmeasured: /);
});

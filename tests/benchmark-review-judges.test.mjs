import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { measureReview } from '../benchmarks/sweep.mjs';
import { tempDir } from './harness.mjs';

const cell = { kind: 'review', variant: 'seeded', task: { id: 'safe-path', file: 'upload.js' } };
const finding = (action, start, end) => ({ file: 'upload.js', start, end, action });

test('measureReview counts report-action overlaps beside fix hits', async () => {
  const review = { verdict: 'FINDINGS', findings: [finding('report', 4, 5), finding('fix', 20, 21)] };
  const record = await measureReview(cell, null, review);
  assert.equal(record.hits, 0);
  assert.equal(record.reportHits, 1);
});

test('measureReview counts a fix overlap as a hit and a report hit', async () => {
  const record = await measureReview(cell, null, { verdict: 'FINDINGS', findings: [finding('fix', 5, 6)] });
  assert.equal(record.hits, 1);
  assert.equal(record.reportHits, 1);
});

test('measureReview leaves hits null without a report', async () => {
  const record = await measureReview(cell, null, { verdict: null, findings: null });
  assert.equal(record.hits, null);
  assert.equal(record.reportHits, null);
});

const { AGENT_PATH, FOCUS, buildJudges } = await import('../lib/review-judges.mjs');
const sourceLines = readFileSync(new URL(`../${AGENT_PATH}`, import.meta.url), 'utf8').split('\n');

test('each focus prefix matches one agent line and lands in only its judge', () => {
  const judges = buildJudges(sourceLines.join('\n'));
  for (const [name, prefixes] of Object.entries(FOCUS)) {
    for (const prefix of prefixes) {
      const matches = sourceLines.filter((line) => line.startsWith(prefix));
      assert.equal(matches.length, 1, prefix);
      const holders = Object.keys(judges).filter((judge) => judges[judge].split('\n').includes(matches[0]));
      assert.deepEqual(holders, [name], prefix);
    }
  }
});

test('judgeCells makes one review cell per judge and leaves other cells', async () => {
  const { judgeCells, sweepCells } = await import('../benchmarks/sweep-cells.mjs');
  const cells = sweepCells();
  const reviews = cells.filter((c) => c.kind === 'review');
  const judged = judgeCells(cells, { 'plan-fit': 'A', tests: 'B' });
  const judges = judged.filter((c) => c.kind === 'review');
  assert.equal(judges.length, reviews.length * 2);
  assert.equal(judges[0].id, `${reviews[0].id}-judge-plan-fit`);
  assert.equal(judges[1].appendSystemPrompt, 'B');
  assert.equal(judged.length - judges.length, cells.length - reviews.length);
});

const { mergeJudgeRecords } = await import('../benchmarks/merge-judges.mjs');
const { mkdirSync, writeFileSync } = await import('node:fs');
const { join } = await import('node:path');

function writeCell(root, id, { report, ...record }) {
  mkdirSync(join(root, id));
  writeFileSync(join(root, id, 'record.json'), JSON.stringify({ id, kind: 'review', variant: 'seeded', model: 'opus', effort: 'high', exitCode: 0, timedOut: false, ...record }));
  if (report !== null) writeFileSync(join(root, id, 'branch-review.md'), report);
}

async function seededJudgeRoot() {
  const { sweepCells } = await import('../benchmarks/sweep-cells.mjs');
  const seeded = sweepCells().find((c) => c.kind === 'review' && c.variant === 'seeded');
  const { defectRange } = await import('../benchmarks/sweep-fixtures.mjs');
  const range = defectRange(seeded.task);
  const root = tempDir('judges-');
  const hit = `FINDINGS\n\n${range.file}:${range.start}-${range.end} defect fix\nProbe: node x.js\nClass: swallowed failure\nSweep: grep -n catch x.js\n\nCount: defect=1 concern=0 question=0\n`;
  const clean = 'CLEAN\n\nCount: defect=0 concern=0 question=0\n';
  writeCell(root, `${seeded.id}-judge-plan-fit`, { wallMs: 100, tokens: 10, costUsd: 1, report: clean });
  writeCell(root, `${seeded.id}-judge-standard`, { wallMs: 300, tokens: 20, costUsd: 2, report: hit });
  writeCell(root, `${seeded.id}-judge-tests`, { wallMs: 200, tokens: 30, costUsd: 3, report: clean });
  return { root, seeded };
}

test('mergeJudgeRecords sums judge cost and grades the merged findings', async () => {
  const { root, seeded } = await seededJudgeRoot();
  const [merged, ...others] = await mergeJudgeRecords(root);
  assert.equal(others.length, 0);
  assert.equal(merged.id, seeded.id);
  assert.equal(merged.tokens, 60);
  assert.equal(merged.costUsd, 6);
  assert.equal(merged.wallMsMax, 300);
  assert.equal(merged.wallMsSum, 600);
  assert.equal(merged.hits, 1);
  assert.equal(merged.reportHits, 1);
});

test('mergeJudgeRecords merges a control record and nulls findings for a missing report', async () => {
  const { sweepCells } = await import('../benchmarks/sweep-cells.mjs');
  const cells = sweepCells().filter((c) => c.kind === 'review' && c.variant === 'seeded');
  const root = tempDir('judges-');
  writeCell(root, cells[0].id, { wallMs: 50, tokens: 5, costUsd: 0.5, report: 'CLEAN\n\nCount: defect=0 concern=0 question=0\n' });
  writeCell(root, `${cells[1].id}-judge-plan-fit`, { wallMs: 10, tokens: 1, costUsd: 0.1, report: null });
  writeCell(root, `${cells[1].id}-judge-tests`, { wallMs: 20, tokens: 2, costUsd: 0.2, report: 'CLEAN\n' });
  const merged = await mergeJudgeRecords(root);
  const control = merged.find((r) => r.id === cells[0].id);
  const partial = merged.find((r) => r.id === cells[1].id);
  assert.equal(control.hits, 0);
  assert.equal(control.tokens, 5);
  assert.equal(partial.findings, null);
  assert.equal(partial.hits, null);
  assert.equal(partial.missingReports, 1);
});

test('mergeJudgeRecords nulls findings when a judge cell left no record', async () => {
  const { sweepCells } = await import('../benchmarks/sweep-cells.mjs');
  const seeded = sweepCells().find((c) => c.kind === 'review' && c.variant === 'seeded');
  const root = tempDir('judges-');
  const clean = 'CLEAN\n\nCount: defect=0 concern=0 question=0\n';
  writeCell(root, `${seeded.id}-judge-plan-fit`, { wallMs: 10, tokens: 1, costUsd: 0.1, report: clean });
  writeCell(root, `${seeded.id}-judge-standard`, { wallMs: 20, tokens: 2, costUsd: 0.2, report: clean });
  const [merged] = await mergeJudgeRecords(root);
  assert.equal(merged.judges, 2);
  assert.equal(merged.findings, null);
  assert.equal(merged.hits, null);
  assert.equal(merged.missingJudges, 1);
  assert.equal(merged.missingReports, 0);
});

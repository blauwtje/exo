import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { mergeReviews } from '../skills/verify/scripts/merge-reviews.mjs';
import { JUDGE_NAMES, measureReview } from './sweep.mjs';
import { sweepCells } from './sweep-cells.mjs';
import { parseReview } from './sweep-score.mjs';

const JUDGE_SUFFIX = /-judge-([\w-]+)$/;

function readCells(runDirectory) {
  return fs.readdirSync(runDirectory).flatMap((name) => {
    const recordFile = path.join(runDirectory, name, 'record.json');
    if (!fs.existsSync(recordFile)) return [];
    const reportFile = path.join(runDirectory, name, 'branch-review.md');
    return [{ record: JSON.parse(fs.readFileSync(recordFile, 'utf8')), report: fs.existsSync(reportFile) ? fs.readFileSync(reportFile, 'utf8') : null }];
  });
}

function sumOrNull(values) {
  return values.some((value) => typeof value !== 'number') ? null : values.reduce((sum, value) => sum + value, 0);
}

function mergedReview(members, missing) {
  if (missing) return { verdict: null, counts: null, findings: null };
  const merged = mergeReviews(members.map(({ record, report }) => ({ name: JUDGE_SUFFIX.exec(record.id)?.[1] ?? 'control', text: report })));
  const { defect, concern, question } = merged.counts;
  return { verdict: merged.verdict, counts: { defect, concern, question }, findings: parseReview(merged.text).findings };
}

function mergedTotals(members) {
  const wallTimes = members.map(({ record }) => record.wallMs);
  return {
    timedOut: members.some(({ record }) => record.timedOut),
    tokens: sumOrNull(members.map(({ record }) => record.tokens)),
    costUsd: sumOrNull(members.map(({ record }) => record.costUsd)),
    wallMs: Math.max(...wallTimes),
    wallMsMax: Math.max(...wallTimes),
    wallMsSum: sumOrNull(wallTimes)
  };
}

async function mergeGroup(baseId, members, cellsById) {
  const first = members[0].record;
  const absent = JUDGE_SUFFIX.test(first.id) ? Math.max(0, JUDGE_NAMES.length - members.length) : 0;
  const missing = absent > 0 || members.some((member) => member.report === null);
  const review = mergedReview(members, missing);
  const { id: _id, wallMs: _wall, tokens: _tokens, costUsd: _cost, outputTokens: _output, exitCode: _exit, timedOut: _timedOut, detail: _detail, ...kept } = first;
  const measured = await measureReview(cellsById.get(baseId), null, review);
  return {
    ...kept,
    id: baseId,
    judges: members.length,
    missingJudges: absent,
    missingReports: members.filter((member) => member.report === null).length,
    ...mergedTotals(members),
    verdict: review.verdict,
    findings: review.findings,
    ...measured
  };
}

export async function mergeJudgeRecords(runDirectory) {
  const cellsById = new Map(sweepCells().map((cell) => [cell.id, cell]));
  const groups = new Map();
  for (const member of readCells(runDirectory)) {
    if (member.record.kind !== 'review') continue;
    const baseId = member.record.id.replace(JUDGE_SUFFIX, '');
    const key = `${baseId}#${member.record.repeat ?? ''}`;
    groups.set(key, [...(groups.get(key) ?? []), member]);
  }
  return Promise.all([...groups.entries()].map(([key, members]) => mergeGroup(key.split('#')[0], members, cellsById)));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [runDirectory, ...rest] = process.argv.slice(2);
  if (!runDirectory || rest.length > 0) {
    console.error('Usage: node benchmarks/merge-judges.mjs <sweep run directory>');
    process.exit(2);
  }
  const merged = await mergeJudgeRecords(runDirectory);
  fs.writeFileSync(path.join(runDirectory, 'merged-judges.json'), `${JSON.stringify(merged, null, 2)}\n`);
  for (const record of merged) console.log(`${record.id}${record.repeat === undefined ? '' : `-${record.repeat}`} judges=${record.judges} hits=${record.hits ?? '-'} reportHits=${record.reportHits ?? '-'} tokens=${record.tokens ?? '-'}`);
}

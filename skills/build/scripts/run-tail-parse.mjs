import fs from 'node:fs';
import { fixerMark, withoutFixerMark } from '#fixer-mark';

export function parseReviewLines(text) {
  let review = null;
  const branches = [];
  const overlaps = [];
  for (const line of text.split('\n')) {
    const dispatch = line.match(/^DISPATCH Branch(?: (\d+)\/(\d+))?: .*\bscope=branch (\S+).*\bfindings=(\S+)/);
    if (dispatch !== null) branches.push({ range: dispatch[3], findings: dispatch[4], input: line.match(/\binput=(\S+)/)?.[1], number: dispatch[1] });
    const branchLine = line.match(/^REVIEW Branch ([^:]*): (review-branch)(?: exo-kind: (\S+))?\s*$/);
    if (branchLine !== null) review = { range: branchLine[1], kind: branchLine[3] ?? 'review-branch' };
    const overlap = line.match(/^OVERLAP (?!none)(.+?) \(Tasks [^)]*\)$/);
    if (overlap !== null) overlaps.push(overlap[1]);
  }
  return { review, branches, overlaps };
}

export function unprovenRisks(findings) {
  if (!fs.existsSync(findings)) return [];
  return fs.readFileSync(findings, 'utf8').split('\n')
    .filter((line) => /\bconcern\b/.test(line) && /^unproven\b/.test(fixerMark(line)?.reason ?? ''))
    .map((line) => withoutFixerMark(line).trim());
}

export function parseRepairLines(text) {
  const lines = text.split('\n');
  const stopLine = lines.find((line) => /^STOP\b/.test(line) || /^LOOP next=stop\b/.test(line));
  return { stopLine, failLine: lines.find((line) => /^FAIL\b/.test(line)) };
}

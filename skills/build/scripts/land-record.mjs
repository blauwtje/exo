import fs from 'node:fs';
import path from 'node:path';
import { BLOCK_TASK_LIMIT, decisionsPathOf, proofRecordPath } from '#plan-tasks';

const CHOICE_LINE =/^\s*(?:[-*]\s+)?Choice:\s*(.+?)\s*$/;

export function appendDecisions({ planPath, reportText, taskCount, number, sha }) {
  if (planPath === undefined || reportText === null || taskCount <= BLOCK_TASK_LIMIT) return;
  const choices = reportText.replace(/\r\n/g, '\n').split('\n').flatMap((line) => {
    const match = line.match(CHOICE_LINE);
    return match === null ? [] : [`Task ${number} ${sha}: ${match[1]}\n`];
  });
  if (choices.length > 0) fs.appendFileSync(decisionsPathOf(planPath), choices.join(''));
}


const PASS_SUMMARY_LINE = /^(?:ℹ |# )?pass \d+\b|\b\d+ (?:passing|passed)\b|^Tests:/;
const TIMING_LINE = /^(?:ℹ |# )?duration_ms\b|^(?:Time|Duration|Done in)\b/;

export function proofOutcomeOf(tail) {
  const lines = tail.map((line) => line.trim()).filter((line) => !TIMING_LINE.test(line));
  const outcome = lines.findLast((line) => PASS_SUMMARY_LINE.test(line)) ?? lines.at(-1) ?? 'no output';
  return `exit 0, ${outcome}`;
}

export function writeProofRecord({ root, planId, number, proofs, redLine }) {
  const lines = [...proofs.map(({ command, tail }) => `Proof: \`${command}\` -> ${proofOutcomeOf(tail)}\n`), `${redLine}\n`];
  const record = proofRecordPath(root, planId, number);
  fs.mkdirSync(path.dirname(record), { recursive: true });
  fs.writeFileSync(record, lines.join(''));
}

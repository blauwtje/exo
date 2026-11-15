import fs from 'node:fs';
import { decisionsPathOf, planIdOf, proofRecordPath } from '#plan-landed';

export function proofLines(planPath, landed, root) {
  const planId = planIdOf(planPath);
  const lines = landed.map((number) => {
    const record = proofRecordPath(root, planId, number);
    if (!fs.existsSync(record)) return `No proof: Task ${number} landed with no land-task record`;
    const text = fs.readFileSync(record, 'utf8').trimEnd();
    return /^Proof:/m.test(text) ? text : `No proof: Task ${number} landed with no passing Bash proof\n${text}`;
  });
  const decisions = decisionsPathOf(planPath);
  if (fs.existsSync(decisions)) lines.push(`Decisions: ${decisions}`);
  return lines;
}

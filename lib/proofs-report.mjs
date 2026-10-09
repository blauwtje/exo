import fs from 'node:fs';
import { UsageError } from '#script-flags';
import { decisionsPathOf, landedTasks, parsePlan, planIdOf, proofRecordPath } from '#plan-tasks';

// The report's proof lines, read from land-task's records instead of rerun, so
// the session reads no plan, test or script to name a landed task's proof.
export function proofLines(planPath, landed, root) {
  const planId = planIdOf(planPath);
  const lines = landed.map((number) => {
    const record = proofRecordPath(root, planId, number);
    return fs.existsSync(record) ? fs.readFileSync(record, 'utf8').trimEnd() : `No proof: Task ${number} landed with no land-task record`;
  });
  const decisions = decisionsPathOf(planPath);
  if (fs.existsSync(decisions)) lines.push(`Decisions: ${decisions}`);
  return lines;
}

export function proofsReport({ planPath, planText, root }) {
  const plan = parsePlan(planText);
  if (plan.tasks.length === 0) throw new UsageError(`${planPath} holds no '### Task <n>:' heading`);
  const lines = proofLines(planPath, landedTasks(plan.tasks, root, planIdOf(planPath)), root);
  return lines.length === 0 ? 'Landed: none\n' : `${lines.join('\n')}\n`;
}

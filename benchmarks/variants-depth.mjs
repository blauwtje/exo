import fs from 'node:fs';
import path from 'node:path';

export const RUN_LOOP = 'skills/build/references/run-loop.md';
export const UNIT_DISPATCH_TEXT = [
    '5. **Dispatch the unit.** Send the `Block:` tasks to `exo:task-runner`, silently with `run_in_background: false`, keeping the turn open.',
    '   - Name plan path, branch, checkout and exactly the `Block:` tasks.',
    '   - The tail (`gate`) stays here, in no runner brief.',
    '   - Build no task here and call no ScheduleWakeup, ListAgents, Monitor or sleep meanwhile.'
  ].join('\n');
export const DIRECT_BUILD_EDIT = {
  file: RUN_LOOP,
  from: UNIT_DISPATCH_TEXT,
  to: [
    '5. **Dispatch each task.** Dispatch no task-runner agent: send every `Block:` task straight to `exo:build-task`, silently with `run_in_background: false`, keeping the turn open.',
    '   - Name plan path, branch, checkout and the one task in each brief.',
    '   - Produce each task\'s `LANDED` or `BLOCKED` line yourself for step 6.'
  ].join('\n')
};
export const NO_FORK_EDIT = {
  file: 'skills/build/SKILL.md',
  from: 'context: fork\nagent: exo:orchestrator\n',
  to: ''
};
export function directBuildProblems(copy) {
  const loop = fs.readFileSync(path.join(copy, RUN_LOOP), 'utf8');
  const problems = [];
  if (loop.includes('exo:task-runner')) problems.push('the run loop still dispatches exo:task-runner');
  if (!loop.includes('straight to `exo:build-task`')) problems.push('the run loop does not dispatch exo:build-task itself');
  return problems;
}

export function noForkProblems(copy) {
  const skill = fs.readFileSync(path.join(copy, 'skills/build/SKILL.md'), 'utf8');
  return /^(context|agent):/m.test(skill) ? ['skills/build/SKILL.md still holds a context or agent line'] : [];
}

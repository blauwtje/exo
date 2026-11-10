import fs from 'node:fs';
import path from 'node:path';

export const RUN_LOOP = 'skills/build/references/run-loop.md';
export const UNIT_DISPATCH_TEXT = [
    '5. **Dispatch the unit.** Send the `Block:` tasks to `exo:task-runner`, silently with `run_in_background: false`, keeping the turn open.',
    '   - Name plan path, branch, checkout and exactly the `Block:` tasks.',
    '   - The tail (`gate`) stays here, in no runner brief.',
    '   - Build no task here and call no ScheduleWakeup, ListAgents, Monitor or sleep meanwhile.'
  ].join('\n');
export function noForkProblems(copy) {
  const skill = fs.readFileSync(path.join(copy, 'skills/build/SKILL.md'), 'utf8');
  return /^(context|agent):/m.test(skill) ? ['skills/build/SKILL.md still holds a context or agent line'] : [];
}

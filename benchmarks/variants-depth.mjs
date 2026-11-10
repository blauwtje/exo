export const BUILD_SKILL = 'skills/build/SKILL.md';
export const UNIT_DISPATCH_TEXT = [
    '5. **Dispatch the unit.** Send exactly the `Block:` tasks to `exo:task-runner` with plan path, branch and checkout, silently, `run_in_background: false`, turn open.',
    '   - Build no task here.',
    '   - Call no ScheduleWakeup, ListAgents, Monitor or sleep.'
  ].join('\n');

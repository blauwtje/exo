export const RUN_LOOP = 'skills/build/references/run-loop.md';
export const UNIT_DISPATCH_TEXT = [
    '5. **Dispatch the unit.** Send the `Block:` tasks to `exo:task-runner`, silently with `run_in_background: false`, keeping the turn open.',
    '   - Name plan path, branch, checkout and exactly the `Block:` tasks.',
    '   - The tail (`gate`) stays here, in no runner brief.',
    '   - Build no task here and call no ScheduleWakeup, ListAgents, Monitor or sleep meanwhile.'
  ].join('\n');

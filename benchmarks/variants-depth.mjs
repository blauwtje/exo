export const BUILD_SKILL = 'skills/build/SKILL.md';
export const UNIT_DISPATCH_TEXT = [
    '5. **Dispatch the builds.** Send each task of the `Next:` or `Wave:` line to `exo:build-task` in one foreground message, silently; refills follow `references/rolling-window.md`.',
    '   - Build no task here.',
    '   - Call no ScheduleWakeup, ListAgents, Monitor or sleep.'
  ].join('\n');

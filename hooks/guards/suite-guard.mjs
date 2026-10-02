// Bash guard for build, fix and review subagents: refuses a test command that
// runs the whole suite when the last run of that command in this project took
// longer than `subagent_suite_after_seconds`, and points at the task's Proof or
// one test file. The main session, verify and every other agent pass. A
// command with no recorded duration passes, so the first run in a project goes
// through; the setting at 0 switches the guard off. Run from the Bash
// dispatcher, so it starts no process of its own; it stands down with the
// `guards` setting through `guardDecision`.
// Ceiling: a pipeline of several whole-suite segments is judged by its first
// slow segment; the duration log holds one time per key, so none is split.

import { settingValue } from '#settings-store';
import { lastDuration, projectOf, wholeSuiteKeys } from '../../lib/runtime-log.mjs';

function isGuardedAgent(agentType) {
  if (typeof agentType !== 'string') return false;
  return agentType === 'exo:build-task' || agentType === 'exo:fix-review' || agentType.startsWith('exo:review-branch');
}

export function denialFor(command, hookInput) {
  const agentType = hookInput.agent_type;
  if (!isGuardedAgent(agentType)) return null;
  const thresholdSeconds = Number(settingValue('subagent_suite_after_seconds'));
  if (!(thresholdSeconds > 0)) return null;
  const project = projectOf(hookInput);
  for (const key of wholeSuiteKeys(command)) {
    const seconds = lastDuration(project, key);
    if (seconds === null || seconds <= thresholdSeconds) continue;
    const took = Math.round(seconds);
    return `exo: ${agentType} may not run the whole test suite here: its last run in this project took ${took} s, over subagent_suite_after_seconds (${thresholdSeconds} s). Run the task's Proof: command or one test file instead; verify runs the suite in the main session.`;
  }
  return null;
}

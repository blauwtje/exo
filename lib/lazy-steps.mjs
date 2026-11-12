import process from 'node:process';
import { denyReason } from './guard-rules.mjs';
import { refuse, warn } from './hook-refusal.mjs';

export { refuse, warn };

export const SHARED_STATE_STEP = {
  name: 'shared-state-git',
  async run(hookInput) {
    const command = hookInput.tool_input?.command;
    if (!hookInput.agent_id || typeof command !== 'string' || !command.includes('git')) return null;
    const { sharedStateReason } = await import('./git-deny.mjs');
    const reason = sharedStateReason(command);
    return reason && refuse('shared-state', reason);
  }
};

export const COMMIT_ATTRIBUTION_STEP = {
  name: 'commit-attribution',
  async run(hookInput) {
    const command = hookInput.tool_input?.command;
    if (typeof command !== 'string' || !command.includes('commit')) return null;
    const { commitAttributionReason, commitEvidenceReason } = await import('./commit-messages.mjs');
    const cwd = hookInput.cwd ?? process.cwd();
    const attribution = commitAttributionReason(command, cwd);
    if (attribution) return refuse('commit-attribution', attribution);
    const evidence = commitEvidenceReason(command, cwd);
    return evidence && refuse('commit-evidence', evidence, hookInput);
  }
};

export const SUITE_STEP = {
  name: 'suite-unchanged',
  async run(hookInput) {
    if (!hookInput.agent_id) return null;
    const { suiteDecision } = await import('./suite-step.mjs');
    const decision = suiteDecision(hookInput);
    if (decision?.deny) return refuse('suite-passed', denyReason('suite-passed', decision.deny), hookInput);
    return decision && warn(decision.context);
  }
};

export const SHELL_STOP_STEP = {
  name: 'shell-stop',
  run: async (hookInput, outputs = []) => {
    if (outputs.some((output) => output.permissionDecision === 'deny')) return null;
    if (!hookInput.agent_id || !String(hookInput.tool_input?.command).includes('.md')) return null;
    const { shellStopFields } = await import('./live-shells.mjs');
    const fields = shellStopFields(hookInput);
    return fields && { hookSpecificOutput: fields };
  }
};

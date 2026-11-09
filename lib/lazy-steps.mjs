import process from 'node:process';
import { denyReason } from './guard-rules.mjs';

export const deny = (reason) => ({ hookSpecificOutput: { permissionDecision: 'deny', permissionDecisionReason: reason } });

export const SHARED_STATE_STEP = {
  name: 'shared-state-git',
  async run(hookInput) {
    const command = hookInput.tool_input?.command;
    if (!hookInput.agent_id || typeof command !== 'string' || !command.includes('git')) return null;
    const { sharedStateReason } = await import('./git-deny.mjs');
    const reason = sharedStateReason(command);
    return reason && deny(reason);
  }
};

export const COMMIT_ATTRIBUTION_STEP = {
  name: 'commit-attribution',
  async run(hookInput) {
    const command = hookInput.tool_input?.command;
    if (typeof command !== 'string' || !command.includes('commit')) return null;
    const { commitAttributionReason, commitEvidenceReason } = await import('./commit-messages.mjs');
    const cwd = hookInput.cwd ?? process.cwd();
    const reason = commitAttributionReason(command, cwd) ?? commitEvidenceReason(command, cwd);
    return reason && deny(reason);
  }
};

export const SUITE_STEP = {
  name: 'suite-unchanged',
  async run(hookInput) {
    if (!hookInput.agent_id) return null;
    const { suiteDecision } = await import('./suite-step.mjs');
    const decision = suiteDecision(hookInput);
    if (decision?.deny) return deny(denyReason('suite-passed', decision.deny));
    return decision && { hookSpecificOutput: { additionalContext: decision.context } };
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

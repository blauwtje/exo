import process from 'node:process';
import { refuse } from './hook-refusal.mjs';

export { refuse };

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

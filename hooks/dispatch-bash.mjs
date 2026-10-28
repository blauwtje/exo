#!/usr/bin/env node

import process from 'node:process';
import { inSidecall, readHookText } from '#hook-input';
import { contextDecision, contextFields } from '../lib/context-limits.mjs';
import { sharesGitState } from '../lib/git-deny.mjs';
import { fixShell } from '../lib/shell-fixes.mjs';
import { isMain } from '../lib/script-flags.mjs';
import { withReceipt } from './context-limit.mjs';

export const CONTEXT_STEP = {
  name: 'context-limit',
  run(hookInput) {
    const fields = contextFields(contextDecision(hookInput));
    return fields && { hookSpecificOutput: fields };
  }
};

const WIDE_FIND = /(?:^|[;&|(]|&&|\|\|)\s*find\s+(?:-[HLP]\s+)*["']?(?:\/|~\/?|\$HOME|\$\{HOME\}|(?:\.\.\/?)+)["']?(?=\s|$)/;

export const FIND_STEP = {
  name: 'wide-find',
  run(hookInput) {
    const command = hookInput.tool_input?.command;
    if (typeof command !== 'string' || /-maxdepth\s+1(?!\d)/.test(command) || !WIDE_FIND.test(command)) return null;
    return { hookSpecificOutput: { permissionDecision: 'deny', permissionDecisionReason: 'A find over /, ~, $HOME or .. runs past the 120 s tool timeout. Search inside the checkout; a plan input that is missing there → report BLOCKED.' } };
  }
};

export const SHARED_STATE_STEP = {
  name: 'shared-state-git',
  run(hookInput) {
    const command = hookInput.tool_input?.command;
    if (!hookInput.agent_id || typeof command !== 'string' || !sharesGitState(command)) return null;
    return { hookSpecificOutput: { permissionDecision: 'deny', permissionDecisionReason: 'A subagent shares its stash list, worktrees and branches with every other worktree, so git stash, worktree remove, prune, move and branch delete or rename are denied here. Report the need to the lead.' } };
  }
};

export const SHELL_STEP = {
  name: 'shell-fix',
  run(hookInput) {
    // why: a run session gates Bash on prefix allow rules, which a rewritten command no longer matches.
    if (process.env.EXO_RUN_SESSION === '1') return null;
    const updatedInput = fixShell(hookInput.tool_input);
    return updatedInput && { hookSpecificOutput: { updatedInput } };
  }
};

function firstRewrite(outputs) {
  if (outputs.some((output) => output.permissionDecision === 'deny')) return undefined;
  return outputs.find((output) => output.updatedInput && output.permissionDecision === undefined)?.updatedInput;
}

export async function dispatchBash(hookInput, steps = [CONTEXT_STEP, FIND_STEP, SHARED_STATE_STEP, SHELL_STEP], enabled) {
  const outputs = [];
  for (const step of steps) {
    try {
      const output = await step.run(hookInput);
      if (output) outputs.push(output.hookSpecificOutput ?? {});
    } catch (error) {
      console.error(`${step.name}: ${error.message}`);
    }
  }
  const { verdict, output } = mergeOutputs(outputs);
  return withReceipt(output, hookInput, verdict, undefined, enabled);
}

function mergeOutputs(outputs) {
  const verdict = outputs.find((output) => output.permissionDecision === 'deny')
    ?? outputs.find((output) => output.permissionDecision !== undefined);
  const merged = { hookEventName: 'PreToolUse' };
  if (verdict) Object.assign(merged, { permissionDecision: verdict.permissionDecision, permissionDecisionReason: verdict.permissionDecisionReason });
  const rewrite = firstRewrite(outputs);
  if (rewrite) merged.updatedInput = rewrite;
  const contexts = outputs.map((output) => output.additionalContext).filter(Boolean);
  if (contexts.length > 0) merged.additionalContext = contexts.join('\n');
  return { verdict, output: Object.keys(merged).length === 1 ? null : { hookSpecificOutput: merged } };
}

if (isMain(import.meta.url) && !inSidecall()) {
  try {
    const text = await readHookText();
    const output = text.trim() === '' ? null : await dispatchBash(JSON.parse(text));
    if (output !== null) process.stdout.write(`${JSON.stringify(output)}\n`);
  } catch {
  }
}

#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { inSidecall, readHookText } from '#hook-input';
import { scriptBytes } from '../lib/context-limits.mjs';
import { CAPPED_MODES, bashIntakeBound, contextDecision, contextFields, hookAgentType, intakeCutLine } from '../lib/context-decisions.mjs';
import { savedOutputDirectory, savedOutputPrefix } from '../lib/saved-outputs.mjs';
import { sharesGitState } from '../lib/git-deny.mjs';
import { fixShellFor } from '../lib/shell-fixes.mjs';
import { predispatchBashDecision } from '../lib/slice-state.mjs';
import { isMain } from '../lib/script-flags.mjs';
import { withReceipt } from './context-limit.mjs';

const contextStep = (name, decide) => ({
  name,
  run(hookInput) {
    const fields = contextFields(decide(hookInput));
    return fields && { hookSpecificOutput: fields };
  }
});

export const CONTEXT_STEP = contextStep('context-limit', contextDecision);

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
    return { hookSpecificOutput: { permissionDecision: 'deny', permissionDecisionReason: 'Subagents share stash, worktrees and branches with every worktree, so git stash, worktree remove/prune/move and branch delete/rename are denied. Tell the lead.' } };
  }
};

export const SCRIPT_SIZE_STEP = {
  name: 'script-size',
  run(hookInput) {
    const command = hookInput.tool_input?.command;
    if (!hookInput.agent_id || typeof command !== 'string') return null;
    const limit = scriptBytes();
    if (Buffer.byteLength(command) <= limit) return null;
    return { hookSpecificOutput: { permissionDecision: 'deny', permissionDecisionReason: `This command is over ${limit} bytes. Write the script under .exo/ and run the file.` } };
  }
};

export const PREDISPATCH_STEP = contextStep('predispatch', predispatchBashDecision);

const SLEEP_COMMAND = /(?:^|[;&|({\n]|\b(?:do|then|else)\b)\s*sleep(?=\s|$)/;
const SLEEP_AGENTS = new Set(['orchestrator', 'task-runner']);

export const SLEEP_STEP = {
  name: 'sleep',
  run(hookInput) {
    const command = hookInput.tool_input?.command;
    if (typeof command !== 'string' || !SLEEP_AGENTS.has(hookAgentType(hookInput)) || !SLEEP_COMMAND.test(command)) return null;
    return { hookSpecificOutput: { permissionDecision: 'deny', permissionDecisionReason: 'No sleep polling. Interactive: end your turn and wait for the notification; run session: wait-report.mjs with Bash timeout 600000.' } };
  }
};

function cappedCommand(command, bound, log) {
  const quoted = `'${log}'`;
  return [
    `echo "output log: ${log}"`,
    `( ${command}`,
    `) > ${quoted} 2>&1`,
    'rc=$?',
    `head -c ${bound.bytes} ${quoted}`,
    `[ "$(wc -c < ${quoted})" -gt ${bound.bytes} ] && echo "${intakeCutLine(bound, log)}"`,
    'exit $rc'
  ].join('\n');
}

export const RESULT_CAP_STEP = {
  name: 'result-cap',
  run(hookInput) {
    const toolInput = hookInput.tool_input;
    if (!CAPPED_MODES.has(hookInput.permission_mode) || typeof toolInput?.command !== 'string') return null;
    if (toolInput.run_in_background || toolInput.command.endsWith('\\')) return null;
    const bound = bashIntakeBound(hookInput);
    if (!bound) return null;
    const fixed = process.env.EXO_RUN_SESSION === '1' ? null : fixShellFor(hookInput, hookAgentType);
    fs.mkdirSync(savedOutputDirectory(), { recursive: true });
    const log = path.join(savedOutputDirectory(), `${savedOutputPrefix(hookInput.agent_id)}${hookInput.tool_use_id ?? process.pid}.log`);
    const command = cappedCommand((fixed ?? toolInput).command, bound, log);
    return { hookSpecificOutput: { updatedInput: { ...toolInput, command } } };
  }
};

export const SHELL_STEP = {
  name: 'shell-fix',
  run(hookInput) {
    // why: a run session gates Bash on prefix allow rules, which a rewritten command no longer matches.
    if (process.env.EXO_RUN_SESSION === '1') return null;
    const updatedInput = fixShellFor(hookInput, hookAgentType);
    return updatedInput && { hookSpecificOutput: { updatedInput } };
  }
};

function firstRewrite(outputs) {
  if (outputs.some((output) => output.permissionDecision === 'deny')) return undefined;
  return outputs.find((output) => output.updatedInput && output.permissionDecision === undefined)?.updatedInput;
}

export async function dispatchBash(hookInput, steps = [CONTEXT_STEP, FIND_STEP, SHARED_STATE_STEP, SCRIPT_SIZE_STEP, PREDISPATCH_STEP, SLEEP_STEP, RESULT_CAP_STEP, SHELL_STEP], enabled) {
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

#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { inSidecall, readHookText } from '#hook-input';
import { scriptBytes } from '../lib/context-limits.mjs';
import { CAPPED_MODES, bashIntakeBound, contextDecision, contextFields, hookAgentType } from '../lib/context-decisions.mjs';
import { savedOutputDirectory, savedOutputPrefix } from '../lib/saved-outputs.mjs';
import { saveLongCommand } from '../lib/long-command.mjs';
import { denyReason } from '../lib/guard-rules.mjs';
import { stripDataHeredocs } from '../lib/git-deny.mjs';
import { cappedCommand, cappedInput, resultCapped } from '../lib/bash-cap.mjs';
import { redditBashDecision } from '../lib/reddit-route.mjs';
import { fixShellFor, pollsUnbounded } from '../lib/shell-fixes.mjs';
import { predispatchBashDecision } from '../lib/slice-state.mjs';
import { isMain } from '../lib/script-flags.mjs';
import { rememberRefusal, writeHookOutput } from '../lib/hook-refusal.mjs';
import { withReceipt } from './context-limit.mjs';
import { COMMIT_ATTRIBUTION_STEP, SHARED_STATE_STEP, SHELL_STOP_STEP, SUITE_STEP, deny } from '../lib/lazy-steps.mjs';

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
    return typeof command === 'string' && !/-maxdepth\s+1(?!\d)/.test(command) && WIDE_FIND.test(command) ? deny(denyReason('wide-find')) : null;
  }
};

const REDDIT_STEP = {
  name: 'reddit-route',
  run(hookInput) {
    const decision = redditBashDecision(hookInput.tool_input?.command);
    return decision && deny(decision.deny);
  }
};

export const SCRIPT_SIZE_STEP = {
  name: 'script-size',
  run(hookInput, earlier = []) {
    const command = hookInput.tool_input?.command;
    if (!hookInput.agent_id || typeof command !== 'string') return null;
    const limit = scriptBytes();
    if (Buffer.byteLength(command) <= limit) return null;
    if (earlier.some((output) => output.permissionDecision === 'deny')) return null;
    const saved = saveLongCommand(command, hookInput.cwd ?? process.cwd());
    if (!saved) return deny(denyReason('script-size', `this command is over ${limit} bytes`));
    const updatedInput = { ...hookInput.tool_input, command: `bash ${saved}` };
    return { hookSpecificOutput: { updatedInput, additionalContext: `the command was over ${limit} bytes, so it runs from its saved copy ${saved}` } };
  }
};

export const PREDISPATCH_STEP = contextStep('predispatch', predispatchBashDecision);

const SLEEP_COMMAND = /(?:^|[;&|({\n]|\b(?:do|then|else)\b)\s*sleep(?=\s|$)/;
const WATCH_COMMAND = /\bgh\s+(?:pr\s+checks\b.*--watch|run\s+watch\b)/;

export const SLEEP_STEP = {
  name: 'sleep',
  run(hookInput) {
    const command = hookInput.tool_input?.command;
    if (typeof command !== 'string') return null;
    const scanned = stripDataHeredocs(command);
    if (pollsUnbounded(scanned)) return deny(denyReason('sleep'));
    if (!hookInput.agent_id) return null;
    if (SLEEP_COMMAND.test(scanned)) return deny(denyReason('sleep'));
    return WATCH_COMMAND.test(scanned) ? deny(denyReason('watch')) : null;
  }
};

const RESULT_CAP_STEP = {
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
    const inner = (fixed ?? toolInput).command;
    const command = resultCapped(cappedCommand(hookInput, inner) ?? inner, bound, log);
    return { hookSpecificOutput: { updatedInput: { ...toolInput, command }, timed: true } };
  }
};

const SHELL_STEP = {
  name: 'shell-fix',
  run(hookInput) {
    // why: a run session gates Bash on prefix allow rules, which a rewritten command no longer matches.
    if (process.env.EXO_RUN_SESSION === '1') return null;
    const updatedInput = fixShellFor(hookInput, hookAgentType);
    return updatedInput && { hookSpecificOutput: { updatedInput } };
  }
};

const BASH_CAP_STEP = {
  name: 'bash-cap',
  run(hookInput, earlier = []) {
    if (earlier.some((output) => output.permissionDecision === 'deny')) return null;
    if (earlier.some((output) => output.timed)) return null;
    const updatedInput = cappedInput(hookInput, firstRewrite(earlier));
    return updatedInput && { hookSpecificOutput: { updatedInput, capped: true } };
  }
};

function firstRewrite(outputs) {
  if (outputs.some((output) => output.permissionDecision === 'deny')) return undefined;
  const rewrites = outputs.filter((output) => output.updatedInput && output.permissionDecision === undefined);
  return (rewrites.find((output) => output.capped) ?? rewrites[0])?.updatedInput;
}

export async function dispatchBash(hookInput, steps = [CONTEXT_STEP, FIND_STEP, REDDIT_STEP, SHARED_STATE_STEP, COMMIT_ATTRIBUTION_STEP, PREDISPATCH_STEP, SLEEP_STEP, SHELL_STOP_STEP, SUITE_STEP, SCRIPT_SIZE_STEP, RESULT_CAP_STEP, SHELL_STEP, BASH_CAP_STEP], enabled) {
  const outputs = [];
  for (const step of steps) {
    try {
      const output = await step.run(hookInput, outputs);
      if (output) outputs.push(output.hookSpecificOutput ?? {});
    } catch (error) {
      console.error(`${step.name}: ${error.message}`);
    }
  }
  const { verdict, output } = mergeOutputs(outputs);
  return rememberRefusal(hookInput, withReceipt(output, hookInput, verdict, undefined, enabled), { guard: 'dispatch-bash' });
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
    const input = text.trim() === '' ? null : JSON.parse(text);
    writeHookOutput(input, input && await dispatchBash(input), 'dispatch-bash');
  } catch { process.exitCode = 0; }
}

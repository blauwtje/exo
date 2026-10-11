// Run-only Bash guard: in an exo run an irreversible action parks the run
// instead of being refused for good. `runGateReason` names publish, release,
// tag push and deploy commands; `parkOutput` turns a deny into a gate in
// <EXO_RUN_DIR>/gates.md plus a `parked` marker (`Task <n>: PARKED <command>`);
// `approvedPass` lets an approved gate's exact command through once.
// Ceiling: matched on the blanked command, not parsed; a deploy run through a
// package script is not seen.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { inRun } from '#run-decision';
import { openGate, takeApproved } from '../../skills/build/scripts/run-state.mjs';
import { blankCommandText, GIT_PREFIX_SOURCE } from './command-text.mjs';

const START = '(?:^|[;&|(\\n])[ \\t]*';
const RULES = [
  [/(?:^|[\s;&|(])npm +publish\b/, 'npm publish'],
  [/(?:^|[\s;&|(])gh +release\b/, 'gh release'],
  [new RegExp(`${START}${GIT_PREFIX_SOURCE}push\\b[^;&|\\n]*(?:--tags\\b|[ \\t]tag[ \\t]|[ \\t]refs/tags/|[ \\t]v?\\d+\\.\\d+[^ \\t;&|\\n]*)`), 'a tag push'],
  [/(?:^|[\s;&|(])(?:vercel|netlify|fly|flyctl)\b(?: +deploy)?/, 'a deploy']
];

// The deny reason for a command, or null; shaped like a guard's `denialFor`.
export function runGateReason(command) {
  if (!inRun()) return null;
  const blanked = blankCommandText(command);
  const rule = RULES.find(([pattern]) => pattern.test(blanked));
  return rule ? `run-gate: ${rule[1]} cannot be undone and the plan does not allow it.` : null;
}

const oneLine = (command) => command.replace(/\s*\n\s*/g, ' ').trim();

// The deny output of `output` made a parked gate; unchanged outside a run.
export function parkOutput(hookInput, output, env = process.env) {
  if (!output || !inRun(env)) return output;
  const command = oneLine(hookInput.tool_input.command);
  const task = env.EXO_RUN_TASK?.split('/').pop() || 'tail';
  const reason = output.hookSpecificOutput.permissionDecisionReason;
  openGate(env.EXO_RUN_DIR, { source: `task ${task}`, action: command, reason });
  fs.writeFileSync(path.join(env.EXO_RUN_DIR, 'parked'), `Task ${task}: PARKED ${command}\n`);
  const why = `${reason} The run parks for approval; end with \`Task ${task}: BLOCKED parked\`.`;
  return { hookSpecificOutput: { ...output.hookSpecificOutput, permissionDecisionReason: why } };
}

// An allow output when an approved gate holds this exact command, else null.
export function approvedPass(hookInput, env = process.env) {
  if (!inRun(env) || !takeApproved(env.EXO_RUN_DIR, oneLine(hookInput.tool_input.command))) return null;
  return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow', permissionDecisionReason: 'run-gate: an approved gate holds this command.' } };
}

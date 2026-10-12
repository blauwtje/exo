import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { inRun } from '#run-decision';
import { openGate, takeApproved } from '../../skills/build/scripts/run-state.mjs';
import { blankCommandText, GIT_PREFIX_SOURCE } from './command-text.mjs';

const START = '(?:^|[;&|(\\n])[ \\t]*';
const RULES = [
  [/(?:^|[\s;&|(])npm\b[^;&|\n]* +publish(?![\w.-])/, 'npm publish'],
  [/(?:^|[\s;&|(])gh +release\b/, 'gh release'],
  [new RegExp(`${START}${GIT_PREFIX_SOURCE}push\\b[^;&|\\n]*(?:--(?:follow-)?tags\\b|[ \\t]tag[ \\t]|[ \\t:]refs/tags/|[ \\t]v?\\d+\\.\\d+[^ \\t;&|\\n]*)`), 'a tag push'],
  [new RegExp(`${START}(?:(?:\\w+=\\S*|npx|pnpx|bunx)[ \\t]+)*(?:vercel(?![\\w-])|(?:netlify|fly|flyctl)[ \\t]+(?:[^;&|\\n]*[ \\t])?deploy\\b)`), 'a deploy']
];

export function runGateReason(command) {
  if (!inRun()) return null;
  const blanked = blankCommandText(command);
  const rule = RULES.find(([pattern]) => pattern.test(blanked));
  return rule ? `run-gate: ${rule[1]} cannot be undone and the plan does not allow it.` : null;
}

const oneLine = (command) => command.replace(/\s*\n\s*/g, ' ').trim();

export function parkOutput(hookInput, output, env = process.env) {
  if (!output || !inRun(env)) return output;
  const command = oneLine(hookInput.tool_input.command);
  const task = env.EXO_RUN_TASK?.split('/').pop() || 'tail';
  const reason = output.hookSpecificOutput.permissionDecisionReason;
  try {
    openGate(env.EXO_RUN_DIR, { source: `task ${task}`, action: command, reason });
    fs.writeFileSync(path.join(env.EXO_RUN_DIR, 'parked'), `Task ${task}: PARKED ${command}\n`);
  } catch {
    return output;
  }
  const why = `${reason} The run parks for approval; end with \`Task ${task}: BLOCKED parked\`.`;
  return { hookSpecificOutput: { ...output.hookSpecificOutput, permissionDecisionReason: why } };
}

export function approvedPass(hookInput, env = process.env) {
  if (!inRun(env) || !takeApproved(env.EXO_RUN_DIR, oneLine(hookInput.tool_input.command))) return null;
  return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow', permissionDecisionReason: 'run-gate: an approved gate holds this command.' } };
}

import process from 'node:process';
import { onPath } from '#on-path';
import { environmentMs } from '#script-flags';
import { CAPPED_MODES, intakeCutLine } from './context-decisions.mjs';
import { shellQuote } from './basics.mjs';
import { TIMEOUT_FUNCTION } from './shell-fixes.mjs';

const DEFAULT_TIMEOUT_MS = 120000;
const MAX_TIMEOUT_MS = 600000;
const MARGIN_MS = 5000;
const STARTS_WITH_TIMEOUT = /^\s*timeout\s/;
const SESSION_SHELL = '"${SHELL:-/bin/sh}"';

function capSeconds(toolInput, env = process.env) {
  const defaultMs = environmentMs('BASH_DEFAULT_TIMEOUT_MS', DEFAULT_TIMEOUT_MS, env);
  const maxMs = environmentMs('BASH_MAX_TIMEOUT_MS', MAX_TIMEOUT_MS, env);
  const asked = Number.isFinite(toolInput.timeout) && toolInput.timeout > 0 ? toolInput.timeout : defaultMs;
  const limit = Math.min(asked, maxMs);
  const margin = Math.min(environmentMs('EXO_BASH_CAP_MARGIN_MS', MARGIN_MS, env), limit / 2);
  return Math.max(1, Math.floor((limit - margin) / 1000));
}

function isCapped(hookInput) {
  const toolInput = hookInput.tool_input;
  if (!hookInput.agent_id || typeof toolInput?.command !== 'string') return false;
  if (!CAPPED_MODES.has(hookInput.permission_mode) || process.env.EXO_RUN_SESSION === '1') return false;
  return !toolInput.run_in_background && !STARTS_WITH_TIMEOUT.test(toolInput.command);
}

export function cappedCommand(hookInput, command, hasTimeout = onPath('timeout', process.env)) {
  if (!isCapped(hookInput)) return null;
  const prelude = hasTimeout ? '' : TIMEOUT_FUNCTION;
  return `${prelude}timeout ${capSeconds(hookInput.tool_input)} ${SESSION_SHELL} -c ${shellQuote(command)}`;
}

export function cappedInput(hookInput, rewritten) {
  const base = rewritten ?? hookInput.tool_input;
  const command = cappedCommand(hookInput, base.command);
  return command && { ...base, command };
}

export function resultCapped(command, bound, log) {
  const quoted = `'${log}'`;
  return [
    `( ${command}`,
    `) > ${quoted} 2>&1`,
    'rc=$?',
    `head -c ${bound.bytes} ${quoted}`,
    `[ "$(wc -c < ${quoted})" -gt ${bound.bytes} ] && echo "${intakeCutLine(bound, log)}"`,
    'exit $rc'
  ].join('\n');
}

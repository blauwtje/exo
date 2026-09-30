#!/usr/bin/env node
// PreToolUse guard on Bash: denies a launch that detaches a process from the
// session. A process backgrounded with `&`, `nohup`, `disown` or `setsid` is
// reparented away from the tool's shell, so it outlives the session and keeps
// its port open; the Bash tool's `run_in_background` keeps it tracked instead.
// Stands down when the `guards` setting is `off`.
//
// The command is matched after `blankCommandText`, so an `&` or a `nohup` in a
// quoted string, a commit message or a heredoc body is not a launch.
// Ceiling: the command string is matched, not parsed. An `&` in a redirection
// other than `&&`, `|&`, `>&` and `&>` (such as `<&3`) reads as a detach; rewrite
// such a command or run it from a file. A command assembled from variables at run
// time reads as written.
// A failed read of stdin exits 1, a non-blocking error; the guard never exits 2.

import process from 'node:process';
import { readHookText } from '#hook-input';
import { settingValue } from '#settings-store';
import { blankCommandText } from './command-text.mjs';

const REASON = 'detach-guard: this launch would outlive the session and keep its port open. Run the command in the foreground with the Bash tool\'s run_in_background parameter instead, without & / nohup / disown / setsid.';
// `&&`, `|&`, `>&` and `&>` are not background operators.
const NON_BACKGROUND_AMPERSANDS = /&&|\|&|>&|&>/g;
const DETACH_WORD = /(?:^|[;&|( \n])(?:nohup|disown|setsid)(?:[ \n]|$)/;

function detachesProcess(command) {
  const blanked = blankCommandText(command);
  const withoutOperators = blanked.replace(NON_BACKGROUND_AMPERSANDS, '');
  return withoutOperators.includes('&') || DETACH_WORD.test(blanked);
}

// A setting that cannot be read leaves the guard on, because a safety guard that
// a broken settings file switches off would fail open.
function guardsOn() {
  try {
    return settingValue('guards') !== 'off';
  } catch {
    return true;
  }
}

async function main() {
  let hookInput;
  try {
    const text = await readHookText();
    if (text.trim() === '') return;
    hookInput = JSON.parse(text);
  } catch (error) {
    process.stderr.write(`detach-guard: cannot read the hook input: ${error.message}\n`);
    process.exitCode = 1;
    return;
  }
  const command = hookInput.tool_input?.command;
  if (hookInput.tool_name !== 'Bash' || typeof command !== 'string' || command === '') return;
  if (!guardsOn() || !detachesProcess(command)) return;
  const decision = { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: REASON };
  process.stdout.write(`${JSON.stringify({ hookSpecificOutput: decision })}\n`);
}

await main();

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
// A fault reading the input exits 0 with no output; the guard never exits 2.

import { blankCommandText } from './command-text.mjs';
import { runBashGuard } from './guard-runner.mjs';

const REASON = 'detach-guard: this launch would outlive the session and keep its port open. Run the command in the foreground with the Bash tool\'s run_in_background parameter instead, without & / nohup / disown / setsid.';
// `&&`, `|&`, `>&` and `&>` are not background operators.
const NON_BACKGROUND_AMPERSANDS = /&&|\|&|>&|&>/g;
const DETACH_WORD = /(?:^|[;&|( \n])(?:nohup|disown|setsid)(?:[ \n]|$)/;

function detachesProcess(command) {
  const blanked = blankCommandText(command);
  const withoutOperators = blanked.replace(NON_BACKGROUND_AMPERSANDS, '');
  return withoutOperators.includes('&') || DETACH_WORD.test(blanked);
}

await runBashGuard((command) => (detachesProcess(command) ? REASON : null));

// PreToolUse step on Bash: runs a command that starts with a configured heavy
// prefix through hooks/heavy-run.mjs, which runs it once per code state across
// sessions. The `heavy_commands` setting holds the prefixes, separated by `;`;
// empty switches the step off, and the `guards` setting does not. A command
// matches when one of its segments, split on `&&`, `||`, `;` and `|`, starts
// with a prefix after trimming, so an environment assignment in front, such as
// `EXO_HEAVY_FORCE=1 npm run e2e`, does not match and forces a run. The whole
// command is wrapped, with no permission decision, so the harness's permission
// check still decides the call. The step does no git and no hashing; the
// wrapper does. A fault lets the command through unchanged.
// A command whose last run in the project took longer than `heavy_after_seconds`
// (the runtime log, lib/runtime-log.mjs) is wrapped too, when its text equals
// the logged one. A test-like command that is not wrapped has its start booked
// there for hooks/record-runtime.mjs; 0 switches both off.
// Ceiling: the split ignores quotes, so a separator inside a quoted string
// starts a segment there; lift it with the tokeniser in bash-output-guard.mjs.

import { fileURLToPath } from 'node:url';
import { settingValue } from '#settings-store';
import { isLearnable, learnedCommands, projectOf, recordStart, touchLearned } from '../../lib/runtime-log.mjs';

const WRAPPER = fileURLToPath(new URL('../heavy-run.mjs', import.meta.url));
const SEGMENT_SEPARATOR = /&&|\|\||;|\|/;

// One word for bash: single-quoted, each inner quote written as '\''.
export function shellQuote(text) {
  return `'${text.replaceAll("'", "'\\''")}'`;
}

function heavyPrefixes() {
  return String(settingValue('heavy_commands'))
    .split(';')
    .map((prefix) => prefix.trim())
    .filter(Boolean);
}

function matches(command, prefixes) {
  return command
    .split(SEGMENT_SEPARATOR)
    .map((segment) => segment.trim())
    .some((segment) => prefixes.some((prefix) => segment.startsWith(prefix)));
}

// True when `command` matches the `heavy_commands` setting; hooks/record-runtime.mjs
// uses it too, so the two never drift.
export function isListedHeavy(command) {
  const prefixes = heavyPrefixes();
  return prefixes.length > 0 && matches(command, prefixes);
}

// The output for `hookInput`: the command wrapped when it is heavy, else null.
export function heavyCommandStep(hookInput) {
  const command = hookInput.tool_input?.command;
  if (hookInput.tool_name !== 'Bash' || typeof command !== 'string' || command === '') return null;
  const listed = isListedHeavy(command);
  const thresholdSeconds = Number(settingValue('heavy_after_seconds'));
  const learning = thresholdSeconds > 0 && isLearnable(command);
  const project = projectOf(hookInput);
  // An entry recorded under a threshold since raised no longer counts as heavy.
  const learned = learning && (learnedCommands(project)[command]?.seconds ?? 0) > thresholdSeconds;
  if (!listed && !learned) {
    if (learning && typeof hookInput.session_id === 'string') recordStart({ sessionId: hookInput.session_id, command });
    return null;
  }
  if (!listed) touchLearned({ project, command });
  const session = hookInput.session_id ?? 'unknown';
  const wrapped = `node ${shellQuote(WRAPPER)} --session ${shellQuote(String(session))} -- ${shellQuote(command)}`;
  return { hookSpecificOutput: { hookEventName: 'PreToolUse', updatedInput: { ...hookInput.tool_input, command: wrapped } } };
}

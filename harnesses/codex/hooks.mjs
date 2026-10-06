// The hook entries exo installs into Codex's hooks.json, derived from
// `hooks/hooks.json` by an allowlist: the events and matchers Codex can serve
// (SessionStart, UserPromptSubmit, PreToolUse Bash, PostToolUse Bash). Each
// entry keeps only the handler fields Codex documents, so Claude's `shell` is
// dropped, and runs `harnesses/codex/hook-entry.mjs`, which sets the host and plugin root
// before it imports the script the source entry named.

import fs from 'node:fs';
import path from 'node:path';

// An undefined matcher selects the group the source file gives none.
const ALLOWED = [
  { event: 'SessionStart', matcher: 'startup|resume|clear|compact' },
  { event: 'UserPromptSubmit' },
  { event: 'PreToolUse', matcher: 'Bash' },
  { event: 'PostToolUse', matcher: 'Bash' }
];

// The handler fields of the hooks page of learn.chatgpt.com/docs/hooks.
export const DOCUMENTED_FIELDS = ['type', 'command', 'commandWindows', 'timeout', 'statusMessage', 'additionalContextLimit', 'async'];

// Codex counts additionalContextLimit in tokens; the session hook caps its
// context at 5000 estimated tokens, and this leaves room for the estimate's error.
const SESSION_CONTEXT_LIMIT = 6000;

const SOURCE_COMMAND = /^node "\$\{CLAUDE_PLUGIN_ROOT\}\/([^"$\\]+)"$/;

// cmd.exe expands % and PowerShell expands $ and the backtick inside double
// quotes, so a root holding one cannot be quoted for either.
const WINDOWS_UNQUOTABLE = /["%$`^&!]/;

// Ceiling: a root with such a character gets no `commandWindows`, so a Windows
// host would run the POSIX `command`; lift it once Codex documents its Windows shell.
function quotedCommands(root, target) {
  const entryScript = path.join(root, 'harnesses', 'codex', 'hook-entry.mjs');
  const posixQuoted = `'${entryScript.replaceAll("'", "'\\''")}'`;
  const commands = { command: `node ${posixQuoted} ${target}` };
  if (!WINDOWS_UNQUOTABLE.test(entryScript)) commands.commandWindows = `node "${entryScript}" ${target}`;
  return commands;
}

function sourceHandlers(root, { event, matcher }) {
  const source = JSON.parse(fs.readFileSync(path.join(root, 'hooks', 'hooks.json'), 'utf8'));
  const groups = source.hooks?.[event] ?? [];
  return groups.filter((group) => group.matcher === matcher).flatMap((group) => group.hooks);
}

function targetOf(handler) {
  const found = SOURCE_COMMAND.exec(handler.command ?? '');
  if (found === null) throw new Error(`hooks/hooks.json: cannot list the command ${JSON.stringify(handler.command)} for Codex`);
  return found[1];
}

// The `hooks` object for Codex's hooks.json: event name to matcher groups.
export function codexHookEntries(root) {
  const hooks = {};
  for (const allowed of ALLOWED) {
    const handlers = sourceHandlers(root, allowed).map((handler) => {
      const entry = {};
      for (const field of DOCUMENTED_FIELDS) if (handler[field] !== undefined) entry[field] = handler[field];
      Object.assign(entry, quotedCommands(root, targetOf(handler)));
      if (allowed.event === 'SessionStart') entry.additionalContextLimit = SESSION_CONTEXT_LIMIT;
      return entry;
    });
    if (handlers.length === 0) throw new Error(`hooks/hooks.json: no ${allowed.event} entry to list for Codex`);
    const group = allowed.matcher === undefined ? { hooks: handlers } : { matcher: allowed.matcher, hooks: handlers };
    hooks[allowed.event] = [...(hooks[allowed.event] ?? []), group];
  }
  return hooks;
}

// The root-relative scripts `hook-entry.mjs` may import: those the entries run.
export function codexHookTargets(root) {
  return ALLOWED.flatMap((allowed) => sourceHandlers(root, allowed).map(targetOf));
}

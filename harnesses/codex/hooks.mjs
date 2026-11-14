
import fs from 'node:fs';
import path from 'node:path';

const ALLOWED = [
  { event: 'SessionStart', matcher: 'startup|resume|clear|compact' },
  { event: 'PreToolUse', matcher: 'Bash' }
];

export const DOCUMENTED_FIELDS = ['type', 'command', 'commandWindows', 'timeout', 'statusMessage', 'additionalContextLimit', 'async'];

const SESSION_CONTEXT_LIMIT = 6000;

const SOURCE_COMMAND = /^(?:command -v node >\/dev\/null 2>&1 \|\| (?:exit 0|\{[^;]*; exit 0; \}); )?node "\$\{CLAUDE_PLUGIN_ROOT\}\/([^"$\\]+)"$/;

const WINDOWS_UNQUOTABLE = /["%$`^&!]/;

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

export function codexHookTargets(root) {
  return ALLOWED.flatMap((allowed) => sourceHandlers(root, allowed).map(targetOf));
}

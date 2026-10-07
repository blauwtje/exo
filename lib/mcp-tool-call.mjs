// Recognizes a command that names an MCP tool, which only the session can
// call: verify.mjs hands it to the session, land-task.mjs lands its Proof as
// deferred, never Bash. A builder asks it per Proof, so no agent file lists tool names:
//   node lib/mcp-tool-call.mjs "<proof>"
// prints DEFER for an MCP tool call, else SHELL; no argument exits 2.

import process from 'node:process';
import { isMain } from './script-flags.mjs';

// A command naming an MCP tool by its short name, the part after `mcp__<server>__`.
const MCP_PREFIXED = /^mcp:\S/;
// MCP tool short names a Proof or Success criterion may name without the `mcp:`
// prefix. `mcp:` stays the rule; this list is only the fallback for an unprefixed
// command: roblox-kit's tools, then Roblox Studio's.
const KNOWN_MCP_TOOLS = new Set([
  'run_playtest', 'build_map', 'check_map', 'capture_zones',
  'search_game_tree', 'user_mouse_input', 'execute_luau', 'screen_capture', 'start_stop_play',
  'get_console_output', 'character_navigation', 'user_keyboard_input', 'script_read', 'multi_edit'
]);

/** The command as an `mcp:<tool> <args>` call when it is one, prefixed or starting with a known MCP tool, else null. */
export function mcpToolCall(command) {
  if (MCP_PREFIXED.test(command)) return command;
  return KNOWN_MCP_TOOLS.has(command.split(/\s/, 1)[0]) ? `mcp:${command}` : null;
}

if (isMain(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] !== '') {
    process.stdout.write(mcpToolCall(args[0]) === null ? 'SHELL\n' : 'DEFER\n');
  } else {
    process.stderr.write('usage: node lib/mcp-tool-call.mjs "<proof>"\n');
    process.exitCode = 2;
  }
}

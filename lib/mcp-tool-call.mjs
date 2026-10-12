import process from 'node:process';
import { isMain } from './script-flags.mjs';

const MCP_PREFIXED = /^mcp:\S/;
const KNOWN_MCP_TOOLS = new Set([
  'run_playtest', 'build_map', 'check_map', 'capture_zones',
  'search_game_tree', 'user_mouse_input', 'execute_luau', 'screen_capture', 'start_stop_play',
  'get_console_output', 'character_navigation', 'user_keyboard_input', 'script_read', 'multi_edit'
]);

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

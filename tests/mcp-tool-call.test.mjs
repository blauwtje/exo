// #mcp-tool-call is the one place that tells an MCP tool call from a shell
// command, for verify.mjs, land-task.mjs and proof-check.mjs alike.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mcpToolCall } from '#mcp-tool-call';

test('mcpToolCall reads a prefixed call or a known MCP tool as its mcp: form, else null', () => {
  assert.equal(mcpToolCall('mcp:run_playtest mode=play'), 'mcp:run_playtest mode=play');
  assert.equal(mcpToolCall('run_playtest mode=play'), 'mcp:run_playtest mode=play');
  assert.equal(mcpToolCall('screen_capture'), 'mcp:screen_capture');
  assert.equal(mcpToolCall('build_map spec=arena'), 'mcp:build_map spec=arena');
  assert.equal(mcpToolCall('get_console_output'), 'mcp:get_console_output');
  assert.equal(mcpToolCall('run_playtest_exo_missing mode=play'), null);
  assert.equal(mcpToolCall('npm run check'), null);
});

test('mcpToolCall reads mcp: only as the opening prefix of a named tool', () => {
  assert.equal(mcpToolCall('mcp:'), null);
  assert.equal(mcpToolCall('node -e "1" mcp:run_playtest'), null);
});

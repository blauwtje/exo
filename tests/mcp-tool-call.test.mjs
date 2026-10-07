// #mcp-tool-call is the one place that tells an MCP tool call from a shell
// command, for verify.mjs and land-task.mjs alike.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
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

// A builder runs the CLI from the project checkout, outside the plugin, and
// defers a Proof on DEFER rather than reading tool names itself.
const CLI = fileURLToPath(new URL('../lib/mcp-tool-call.mjs', import.meta.url));

function runCli(args) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-tool-call-'));
  try {
    return spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8' });
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
}

test('the CLI prints DEFER for an MCP Proof with or without mcp:, SHELL for a shell command', () => {
  for (const [proof, verdict] of [['mcp:run_playtest mode=play', 'DEFER'], ['run_playtest mode=play', 'DEFER'], ['npm test', 'SHELL']]) {
    const result = runCli([proof]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, `${verdict}\n`);
  }
});

test('the CLI with no argument is a usage error', () => {
  const result = runCli([]);
  assert.notEqual(result.status, 0);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /usage/);
});

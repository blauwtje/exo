import assert from 'node:assert/strict';
import test from 'node:test';
import { SCRIPT } from '../skills/build/scripts/run-session-paths.mjs';
import { sandboxSettings } from '../skills/build/scripts/run-session-sandbox.mjs';

test('a sandboxed run session runs run-decision.mjs outside the sandbox', () => {
  for (const tail of [false, true]) {
    const { sandbox } = sandboxSettings({ enabled: true, allowedDomains: [] }, { tail });
    assert.ok(sandbox.excludedCommands.includes(`node ${SCRIPT.runDecision}:*`), `tail=${tail}`);
  }
});

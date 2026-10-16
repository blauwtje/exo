import assert from 'node:assert/strict';
import test from 'node:test';
import { SCRIPT, sandboxSettings } from '../skills/build/scripts/run-session.mjs';

// why: decisions.md sits in the main checkout's .exo, outside the sandbox's write roots; run-decision.mjs must run unsandboxed or it fails with EPERM.
test('a sandboxed run session runs run-decision.mjs outside the sandbox', () => {
  for (const tail of [false, true]) {
    const { sandbox } = sandboxSettings({ enabled: true, allowedDomains: [] }, { tail });
    assert.ok(sandbox.excludedCommands.includes(`node ${SCRIPT.runDecision}:*`), `tail=${tail}`);
  }
});

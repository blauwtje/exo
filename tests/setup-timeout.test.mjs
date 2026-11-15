import assert from 'node:assert/strict';
import test from 'node:test';
import { startRunWithNpx } from './setup-fixture.mjs';

test('a stalled setup command ends at its injected deadline and is named as the failure', () => {
  const started = Date.now();
  const { result } = startRunWithNpx({ proofs: ['npx playwright test a'], npxBody: 'sleep 6', env: { EXO_SETUP_TIMEOUT_MS: '300' } });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /setup command `npx -y playwright install chromium` failed/);
  assert.ok(Date.now() - started < 3000, 'timing-ok: the 6 s sleep runs twice this bound when the deadline is ignored');
});

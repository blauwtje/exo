import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { gitRepository, run } from './harness.mjs';

const SCRIPT = fileURLToPath(new URL('../skills/diagnose/scripts/bisect.mjs', import.meta.url));
const REPRO = 'for f in __FILE__; do sh "$f"; done; sh victim.test.sh';

test('a failure needing two polluters in different halves names no single polluter', async () => {
  const root = await gitRepository({
    'victim.test.sh': 'test ! \\( -f marker-a -a -f marker-d \\)\n',
    'a.test.sh': 'touch marker-a\n',
    'b.test.sh': 'true\n',
    'c.test.sh': 'true\n',
    'd.test.sh': 'touch marker-d\n'
  });
  const result = await run(SCRIPT, ['--repro', REPRO], { cwd: root });
  assert.doesNotMatch(result.stdout, /^Polluter: \S+\.test\.sh/m, `named a single polluter: ${result.stdout.trim()}`);
});

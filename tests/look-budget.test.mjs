import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { kindWallMs, loadKinds } from '../lib/loop-budget.mjs';

test('look wall timeout comes from the kinds table', () => {
  assert.equal(kindWallMs('look', {}), loadKinds().look.wallMs);
});

test('environment overrides the look wall timeout', () => {
  assert.equal(kindWallMs('look', { EXO_LOOP_LOOK_WALL_MS: '5000' }), 5000);
});

test('look ends at the wall timeout and keeps earlier fail lines', async (t) => {
  const server = http.createServer((req, res) => {
    if (req.url === '/hang.js') return;
    if (req.url === '/') {
      res.setHeader('content-type', 'text/html');
      return res.end('<script>console.error("early failure")</script><script src="/hang.js"></script>');
    }
    res.statusCode = 404;
    res.end();
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => server.closeAllConnections() || server.close());
  const script = fileURLToPath(new URL('../skills/build/scripts/look.mjs', import.meta.url));
  const env = { ...process.env, EXO_LOOP_LOOK_WALL_MS: '4000' };
  const run = await promisify(execFile)('node', [script, `http://127.0.0.1:${server.address().port}/`, '--out', fs.mkdtempSync(join(tmpdir(), 'look-')), '--no-shots'], { env, timeout: 30000 }).catch((e) => e);
  if (run.code === 2) return t.skip('playwright missing');
  assert.equal(run.code, 1);
  assert.match(run.stdout, /^CONSOLE /m);
  assert.match(run.stdout, /LOOK timeout 4000ms\nLOOK fail=\d+/);
});

test('design prose names the ledger kinds', () => {
  const dir = new URL('../skills/build/references/', import.meta.url);
  assert.match(fs.readFileSync(new URL('design-ui.md', dir), 'utf8'), /ledger kind `look`/);
  assert.match(fs.readFileSync(new URL('critic.md', dir), 'utf8'), /ledger kind `look`/);
});

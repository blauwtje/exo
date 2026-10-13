import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { test } from 'node:test';
import { git } from './harness.mjs';
import { land, runPlan, setup } from './run-plan-fixture.mjs';

const SERVER = `import fs from 'node:fs';
import http from 'node:http';
fs.writeFileSync(process.argv[3], String(process.pid));
http.createServer((request, response) => response.end('ok')).listen(Number(process.argv[2]), '127.0.0.1');
`;

const freePort = () => new Promise((resolve) => {
  const server = net.createServer();
  server.listen(0, '127.0.0.1', () => {
    const { port } = server.address();
    server.close(() => resolve(port));
  });
});

const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

const waitGone = async (pid) => {
  for (let round = 0; round < 50 && alive(pid); round += 1) await new Promise((resolve) => setTimeout(resolve, 100));
  return !alive(pid);
};

async function withApp(context, { start, ready }) {
  const text = (await fs.readFile(context.plan, 'utf8')).replace('Lint: none', `Lint: none\nApp: ${start} | Ready: ${ready}`);
  await fs.writeFile(context.plan, text);
  git(context.root, 'commit', '-q', '-am', 'docs: add the App line');
}

test('the app is up while a proof runs and its tree is killed when the run ends', async () => {
  const context = await setup();
  const port = await freePort();
  const url = `http://127.0.0.1:${port}`;
  const server = path.join(context.tools, 'server.mjs');
  const pidFile = path.join(context.tools, 'app.pid');
  await fs.writeFile(server, SERVER);
  await withApp(context, { start: `node ${server} ${port} ${pidFile}`, ready: url });
  const probe = `node -e "fetch('${url}').then((answer) => process.exit(answer.ok ? 0 : 1), () => process.exit(1))"`;
  const text = (await fs.readFile(context.plan, 'utf8')).replace('Proof: node --version | Red: none (fixture)', `Proof: ${probe} | Red: none (fixture)`);
  await fs.writeFile(context.plan, text);
  git(context.root, 'commit', '-q', '-am', 'docs: probe the app');
  const result = await runPlan(context, [land(1), land(2)]);
  assert.equal(result.code, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /app ready: /);
  assert.ok(await waitGone(Number(await fs.readFile(pidFile, 'utf8'))), 'the app process outlived the run');
});

test('an app that never answers lets the tasks run and stops the run before the Success criterion', async () => {
  const context = await setup();
  await withApp(context, { start: 'node -e "setInterval(() => {}, 1000)"', ready: 'http://127.0.0.1:1' });
  context.env = { EXO_APP_READY_MS: '1500' };
  const result = await runPlan(context, [land(1), land(2)]);
  assert.notEqual(result.code, 0, result.stdout);
  assert.ok(result.calls.length > 0, 'a session starts although the app is not ready');
  assert.match(result.stdout, /app not ready, app log ends: /);
  assert.match(result.stop, /app not ready: http:\/\/127\.0\.0\.1:1 did not answer within 2 s/);
});

test('an app that exits at once is reported with its log tail without waiting for the deadline', async () => {
  const context = await setup();
  await withApp(context, { start: 'echo boom-from-app; exit 1', ready: 'http://127.0.0.1:1' });
  context.env = { EXO_APP_READY_MS: '60000' };
  const started = Date.now();
  const result = await runPlan(context, [land(1), land(2)]);
  assert.ok(Date.now() - started < 30_000, 'the run waited for the deadline of a dead app');
  assert.match(result.stdout, /app not ready, app log ends: boom-from-app/);
  assert.match(result.stop, /app not ready: /);
});

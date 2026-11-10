import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { HOOK_WORK_LOCK } from '../verify/budgets.mjs';
import { checkHookWork } from '../verify/checks/hook-budgets.mjs';
import { HOOK_INPUTS, countHookWork } from '../verify/hook-work.mjs';
import { createRepository } from '../verify/repository.mjs';
import { tempDir } from './harness.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const QUIET = 'process.stdin.resume();\nprocess.stdin.on("end", () => process.exit(0));\n';

function registered(names) {
  const hooks = names.map((name) => ({ type: 'command', command: `node "\${CLAUDE_PLUGIN_ROOT}/hooks/${name}"` }));
  return JSON.stringify({ hooks: { PreToolUse: [{ matcher: 'Bash', hooks }] } });
}

function runCheck(names, count) {
  const root = tempDir('hook-work-');
  fs.mkdirSync(path.join(root, 'hooks'));
  fs.writeFileSync(path.join(root, 'hooks', 'hooks.json'), registered(names));
  const results = [];
  checkHookWork({ result: (status, name, detail) => results.push({ status, name, detail }) }, createRepository(root), count);
  return results;
}

function workScript(body) {
  const folder = tempDir('hook-work-script-');
  const script = path.join(folder, 'dispatch-bash.mjs');
  fs.writeFileSync(script, body);
  return script;
}

test('every hook input has a lock row and the reverse', () => {
  assert.deepEqual(Object.keys(HOOK_WORK_LOCK.scripts).sort(), Object.keys(HOOK_INPUTS).sort());
  assert.match(HOOK_WORK_LOCK.measured, /^\d{4}-\d{2}-\d{2}$/);
});

test('the counter sees a module import, an imported file and each wrapped read', () => {
  const helper = workScript('export const value = 1;\n');
  const script = workScript(`import { readFileSync } from 'node:fs';\nimport { readFile } from 'node:fs/promises';\nimport ${JSON.stringify(helper)};\nreadFileSync(${JSON.stringify(helper)});\nawait readFile(${JSON.stringify(helper)});\n`);
  const work = countHookWork(script, 'dispatch-bash.mjs');
  assert.equal(work.reads, 2);
  assert.ok(work.urls.includes(pathToFileURL(fs.realpathSync(helper)).href));
});

test('two runs of a hook give identical counts', () => {
  const script = path.join(ROOT, 'hooks', 'dispatch-bash.mjs');
  assert.deepEqual(countHookWork(script, 'dispatch-bash.mjs'), countHookWork(script, 'dispatch-bash.mjs'));
});

test('every registered hook stays within its lock row', () => {
  const results = [];
  checkHookWork({ result: (status, name, detail) => results.push({ status, name, detail }) }, createRepository(ROOT));
  assert.deepEqual(results.map((result) => result.status), ['PASS']);
});

test('a hook over its row fails and names the lock file', () => {
  const lock = HOOK_WORK_LOCK.scripts['dispatch-bash.mjs'];
  const results = runCheck(['dispatch-bash.mjs'], () => ({ modules: lock.modules + 1, reads: lock.reads }));
  assert.deepEqual(results.map((result) => result.status), ['FAIL']);
  assert.match(results[0].detail, /verify\/budgets\.mjs/);
});

test('a registered hook with no row fails', () => {
  const results = runCheck(['unlisted.mjs'], () => ({ modules: 0, reads: 0 }));
  assert.deepEqual(results.map((result) => result.status), ['FAIL']);
  assert.match(results[0].detail, /unlisted\.mjs has no row/);
});

test('a hook that exits non-zero fails', () => {
  const results = runCheck(['dispatch-bash.mjs'], () => null);
  assert.deepEqual(results.map((result) => result.status), ['FAIL']);
});

test('a quiet hook script counts one module and no reads', () => {
  const work = countHookWork(workScript(QUIET), 'dispatch-bash.mjs');
  assert.equal(work.reads, 0);
});

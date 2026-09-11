// The correctness gate and the LOC count read a git workdir after the agent
// wrote into it: added lines on code files, lockfiles and tests skipped, a
// route marker for a backend task and a new .tsx file for a frontend task.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fixture } from './harness.mjs';
import { measureWorkdir } from '../benchmarks/cell-checks.mjs';

const GIT_IDENTITY = ['-c', 'user.name=bench', '-c', 'user.email=bench@example.com'];

async function repo() {
  const workdir = await fixture();
  await fs.mkdir(path.join(workdir, 'backend/app/api/routes'), { recursive: true });
  await fs.mkdir(path.join(workdir, 'frontend/src/components'), { recursive: true });
  await fs.writeFile(path.join(workdir, 'backend/app/api/routes/items.py'), 'from fastapi import APIRouter\nrouter = APIRouter()\n');
  await fs.writeFile(path.join(workdir, 'frontend/src/components/Old.tsx'), 'export const Old = () => null\n');
  await fs.writeFile(path.join(workdir, 'bun.lock'), '{}\n');
  execFileSync('git', ['init', '-q'], { cwd: workdir });
  execFileSync('git', [...GIT_IDENTITY, 'add', '-A'], { cwd: workdir });
  execFileSync('git', [...GIT_IDENTITY, 'commit', '-q', '-m', 'seed'], { cwd: workdir });
  return workdir;
}

test('a backend task is correct when a route was added and the python compiles', async () => {
  const workdir = await repo();
  await fs.appendFile(path.join(workdir, 'backend/app/api/routes/items.py'), '\n\n@router.get("/count")\ndef count_items():\n    return 0\n');
  await fs.mkdir(path.join(workdir, 'backend/tests'), { recursive: true });
  await fs.writeFile(path.join(workdir, 'backend/tests/test_count.py'), 'def test_count():\n    assert True\n');
  await fs.appendFile(path.join(workdir, 'bun.lock'), '{"changed": true}\n');
  const measured = measureWorkdir(workdir, { kind: 'backend' });
  assert.equal(measured.correct, true, measured.correctReason);
  assert.deepEqual(measured.loc, { added: 5, removed: 0, testAdded: 2, files: ['backend/app/api/routes/items.py'] });
});

test('a backend task is not correct when the python does not compile', async () => {
  const workdir = await repo();
  await fs.appendFile(path.join(workdir, 'backend/app/api/routes/items.py'), '\n@router.get("/count")\ndef count_items(:\n');
  const measured = measureWorkdir(workdir, { kind: 'backend' });
  assert.equal(measured.correct, false);
  assert.match(measured.correctReason, /py_compile/);
});

test('a frontend task is correct only with a new .tsx file', async () => {
  const workdir = await repo();
  await fs.appendFile(path.join(workdir, 'frontend/src/components/Old.tsx'), 'export const Also = () => null\n');
  assert.equal(measureWorkdir(workdir, { kind: 'frontend' }).correct, false);
  await fs.writeFile(path.join(workdir, 'frontend/src/components/DatePicker.tsx'), 'export const DatePicker = () => null\n');
  const measured = measureWorkdir(workdir, { kind: 'frontend' });
  assert.equal(measured.correct, true, measured.correctReason);
  assert.equal(measured.loc.added, 2);
});

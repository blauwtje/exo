// benchmarks/variants.mjs builds the cut variants of the plugin copy; each
// applies to a fresh copy, and a target text the copy lacks stops with an error
// naming the variant.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { applyVariant, checkVariant, VARIANTS } from '../benchmarks/variants.mjs';
import { copyPluginWithoutTasks } from '../benchmarks/value.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));

function freshCopy(t) {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-variants-test-'));
  t.after(() => fs.rmSync(scratch, { recursive: true, force: true }));
  return copyPluginWithoutTasks(ROOT, path.join(scratch, 'plugin'));
}

test('every variant builds from this checkout and checks clean', () => {
  assert.deepEqual(Object.keys(VARIANTS), ['session-pointer', 'no-find-cause', 'session-build', 'session-build-no-proof']);
  for (const name of Object.keys(VARIANTS)) assert.deepEqual(checkVariant(name), [], name);
});

test('no-find-cause removes the skill folder and the route clause', (t) => {
  const copy = applyVariant('no-find-cause', freshCopy(t));
  assert.ok(!fs.existsSync(path.join(copy, 'skills', 'find-cause')));
  assert.ok(!fs.readFileSync(path.join(copy, 'skills', 'route-skills', 'SKILL.md'), 'utf8').includes('find-cause'));
});

test('session-build-no-proof swaps the loop and drops only the proof-check handler', (t) => {
  const copy = applyVariant('session-build-no-proof', freshCopy(t));
  const stop = fs.readFileSync(path.join(copy, 'hooks', 'dispatch-stop.mjs'), 'utf8');
  assert.ok(!stop.includes("['proof-check'"));
  assert.ok(stop.includes("['resume-plan'") && stop.includes("['terse-check'"));
  assert.equal(
    fs.readFileSync(path.join(copy, 'skills', 'build', 'references', 'run-loop-direct.md'), 'utf8'),
    fs.readFileSync(path.join(ROOT, 'benchmarks', 'arms', 'build-session.md'), 'utf8')
  );
});

test('a missing target text stops with an error naming the variant', (t) => {
  const copy = freshCopy(t);
  fs.writeFileSync(path.join(copy, 'hooks', 'session-start.mjs'), '// moved\n');
  assert.throws(() => applyVariant('session-pointer', copy), /variant session-pointer: hooks\/session-start\.mjs holds the target text 0 times/);
  fs.rmSync(path.join(copy, 'skills', 'find-cause'), { recursive: true });
  assert.throws(() => applyVariant('no-find-cause', copy), /variant no-find-cause: .*find-cause/);
  assert.throws(() => applyVariant('nope', copy), /variant nope: unknown/);
});

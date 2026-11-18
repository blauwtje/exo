import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkSilentCatch } from '../verify/checks/silent-catch.mjs';
import { createRepository } from '../verify/repository.mjs';
import { checkOutcome, tree } from './check-outcome.mjs';

function run(files) {
  return checkOutcome(checkSilentCatch, createRepository(tree(files)));
}

test('a catch with an error binding passes', () => {
  const result = run({ 'a.mjs': 'try { x(); } catch (error) { throw error; }\n' });
  assert.equal(result.ok, true, result.detail);
});

test('a bindingless catch in a new file fails', () => {
  const result = run({ 'a.mjs': 'try { x(); } catch { }\n' });
  assert.match(result.detail, /a\.mjs has 1 catch blocks without an error binding, baseline 0/);
});

test('one bindingless catch over a baseline fails', () => {
  const result = run({ 'lib/script-flags.mjs': 'try {} catch {}\ntry {} catch {}\n' });
  assert.match(result.detail, /lib\/script-flags\.mjs has 2 .*baseline 1/);
});

test('a bindingless catch inside tests passes', () => {
  const result = run({ 'tests/a.mjs': 'try { x(); } catch { }\n' });
  assert.equal(result.ok, true, result.detail);
});

test('the shipped repository passes', () => {
  const result = checkOutcome(checkSilentCatch, createRepository(new URL('..', import.meta.url).pathname));
  assert.equal(result.ok, true, result.detail);
});

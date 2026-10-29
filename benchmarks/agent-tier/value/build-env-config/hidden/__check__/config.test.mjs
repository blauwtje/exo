import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { loadConfig } from '../src/config.mjs';

test('an empty environment gives the defaults', () => {
  assert.deepEqual(loadConfig({}), { port: 3000, logLevel: 'info' });
});

test('PORT is read as a number', () => {
  assert.equal(loadConfig({ PORT: '8080' }).port, 8080);
});

test('LOG_LEVEL is lowercased', () => {
  assert.equal(loadConfig({ LOG_LEVEL: 'WARN' }).logLevel, 'warn');
});

test('empty strings count as unset', () => {
  assert.deepEqual(loadConfig({ PORT: '', LOG_LEVEL: '' }), { port: 3000, logLevel: 'info' });
});

test('port bounds are inclusive', () => {
  assert.equal(loadConfig({ PORT: '1' }).port, 1);
  assert.equal(loadConfig({ PORT: '65535' }).port, 65535);
});

test('out-of-range and non-integer ports are rejected', () => {
  for (const PORT of ['0', '65536', '-1', '80.5', 'abc', '8080x']) {
    assert.throws(() => loadConfig({ PORT }), new RegExp(`invalid PORT: ${PORT}`), PORT);
  }
});

test('an unknown level is rejected with the raw value', () => {
  assert.throws(() => loadConfig({ LOG_LEVEL: 'Verbose' }), /invalid LOG_LEVEL: Verbose/);
});

test('process.env is the default source', () => {
  const saved = process.env.PORT;
  process.env.PORT = '4321';
  try {
    assert.equal(loadConfig().port, 4321);
  } finally {
    if (saved === undefined) delete process.env.PORT;
    else process.env.PORT = saved;
  }
});

test('.env.example lists both variables', () => {
  const text = readFileSync(new URL('../.env.example', import.meta.url), 'utf8');
  assert.match(text, /^PORT=/m);
  assert.match(text, /^LOG_LEVEL=/m);
});

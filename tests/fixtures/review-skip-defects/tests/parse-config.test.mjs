import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, DEFAULT_PORT, parseConfig, parsePort } from '../src/parse-config.mjs';

test('parsePort accepts a valid port', () => {
  assert.equal(parsePort('3000'), 3000);
});

test('parsePort falls back for an out of range port', () => {
  assert.equal(parsePort('70000'), DEFAULT_PORT);
});

test('parseConfig reads host and port', () => {
  assert.deepEqual(parseConfig('{"host":"example.com","port":"9000"}'), { host: 'example.com', port: 9000 });
});

test('parseConfig uses the defaults for an empty object', () => {
  assert.deepEqual(parseConfig('{}'), DEFAULT_CONFIG);
});

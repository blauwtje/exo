import assert from 'node:assert/strict';
import test from 'node:test';
import { loadConfig } from '../src/config.mjs';
import { describeServer } from '../src/server.mjs';

test('defaults', () => {
  assert.deepEqual(loadConfig(), { port: 3000, logLevel: 'info' });
});

test('describeServer reports port and level', () => {
  assert.equal(describeServer({ port: 8080, logLevel: 'warn' }), 'listening on :8080 (log level warn)');
});

test('environment overrides the defaults', () => {
  assert.deepEqual(loadConfig({ PORT: '8080', LOG_LEVEL: 'DEBUG' }), { port: 8080, logLevel: 'debug' });
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { createDb } from '../src/db.mjs';
import { createSettings } from '../src/settings.mjs';

test('a second read is served from the cache', () => {
  const db = createDb({ u1: { theme: 'dark' } });
  const settings = createSettings(db);
  settings.getSettings('u1');
  settings.getSettings('u1');
  assert.equal(db.reads, 1);
});

test('an update is visible on the next read', () => {
  const db = createDb({ u1: { theme: 'dark' } });
  const settings = createSettings(db);
  settings.getSettings('u1');
  settings.updateSettings('u1', { theme: 'light' });
  assert.equal(settings.getSettings('u1').theme, 'light');
});

test('an unknown user reads as null', () => {
  assert.equal(createSettings(createDb()).getSettings('nobody'), null);
});

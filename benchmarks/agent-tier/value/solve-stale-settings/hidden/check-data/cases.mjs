import assert from 'node:assert/strict';

async function setup(load, rows) {
  const { createDb } = await load('src/db.mjs');
  const { createSettings } = await load('src/settings.mjs');
  const db = createDb(rows);
  return { db, settings: createSettings(db) };
}

export const cases = [
  {
    name: 'a numeric id update is visible on the next read',
    run: async ({ load }) => {
      const { settings } = await setup(load, { 7: { theme: 'dark' } });
      assert.equal(settings.getSettings(7).theme, 'dark');
      settings.updateSettings(7, { theme: 'light' });
      assert.equal(settings.getSettings(7).theme, 'light');
    }
  },
  {
    name: 'reading with a string id after updating with a number sees the update',
    run: async ({ load }) => {
      const { settings } = await setup(load, { 7: { theme: 'dark' } });
      settings.getSettings('7');
      settings.updateSettings(7, { theme: 'light' });
      assert.equal(settings.getSettings('7').theme, 'light');
      settings.updateSettings('7', { theme: 'blue' });
      assert.equal(settings.getSettings(7).theme, 'blue');
    }
  },
  {
    name: 'updateMany refreshes every id whatever its type',
    run: async ({ load }) => {
      const { settings } = await setup(load, { 1: { lang: 'en' }, 2: { lang: 'en' }, u3: { lang: 'en' } });
      [1, '2', 'u3'].forEach((id) => settings.getSettings(id));
      settings.updateMany([1, '2', 'u3'], { lang: 'nl' });
      assert.deepEqual([1, 2, 'u3'].map((id) => settings.getSettings(id).lang), ['nl', 'nl', 'nl']);
    }
  },
  {
    name: 'a deleted user reads as null for both id types',
    run: async ({ load }) => {
      const { settings } = await setup(load, { 5: { theme: 'dark' }, 6: { theme: 'dark' } });
      settings.getSettings(5);
      settings.getSettings('6');
      settings.deleteUser(5);
      settings.deleteUser('6');
      assert.equal(settings.getSettings('5'), null);
      assert.equal(settings.getSettings(6), null);
    }
  },
  {
    name: 'repeated reads still come from the cache, whatever the id type',
    run: async ({ load }) => {
      const { db, settings } = await setup(load, { 9: { theme: 'dark' } });
      settings.getSettings(9);
      settings.getSettings('9');
      settings.getSettings(9);
      assert.equal(db.reads, 1);
      settings.updateSettings(9, { theme: 'light' });
      const before = db.reads;
      settings.getSettings('9');
      settings.getSettings(9);
      assert.ok(db.reads - before <= 1, `${db.reads - before} reads after the update`);
    }
  }
];

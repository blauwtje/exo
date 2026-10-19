// The HOME of a benchmark cell holds no global CLAUDE.md, so scores measure exo
// and not the user's personal rules; the real home keeps its file.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { makeCellHome } from '../benchmarks/cell-home.mjs';

test('the cell home has no .claude/CLAUDE.md while the real home keeps it', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cell-home-test-'));
  const before = process.env.HOME;
  let cellHome;
  try {
    fs.mkdirSync(path.join(home, '.claude', 'projects'), { recursive: true });
    fs.writeFileSync(path.join(home, '.claude', 'CLAUDE.md'), 'global\n');
    fs.writeFileSync(path.join(home, '.claude', 'settings.json'), '{}');
    process.env.HOME = home;
    cellHome = makeCellHome();
    assert.equal(fs.lstatSync(path.join(cellHome, '.claude', 'CLAUDE.md'), { throwIfNoEntry: false }), undefined);
    assert.equal(fs.existsSync(path.join(cellHome, '.claude', 'projects')), true);
    assert.equal(fs.readFileSync(path.join(home, '.claude', 'CLAUDE.md'), 'utf8'), 'global\n');
  } finally {
    process.env.HOME = before;
    fs.rmSync(home, { recursive: true, force: true });
    if (cellHome) fs.rmSync(cellHome, { recursive: true, force: true });
  }
});

test('the cell home turns off the installed exo plugin and keeps the others', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cell-home-test-'));
  const before = process.env.HOME;
  let cellHome;
  try {
    fs.mkdirSync(path.join(home, '.claude'), { recursive: true });
    fs.writeFileSync(path.join(home, '.claude', 'settings.json'), JSON.stringify({ enabledPlugins: { 'exo@blauwtje': true, 'other@market': true } }));
    process.env.HOME = home;
    cellHome = makeCellHome();
    const settings = JSON.parse(fs.readFileSync(path.join(cellHome, '.claude', 'settings.json'), 'utf8'));
    assert.deepEqual(settings.enabledPlugins, { 'exo@blauwtje': false, 'other@market': true });
    assert.equal(JSON.parse(fs.readFileSync(path.join(home, '.claude', 'settings.json'), 'utf8')).enabledPlugins['exo@blauwtje'], true);
  } finally {
    process.env.HOME = before;
    fs.rmSync(home, { recursive: true, force: true });
    if (cellHome) fs.rmSync(cellHome, { recursive: true, force: true });
  }
});

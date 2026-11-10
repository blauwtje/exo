import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runOneCell } from '../skills/edit-skills/scripts/pressure-cell.mjs';
import { cellsFor } from '../skills/edit-skills/scripts/pressure-cells-for.mjs';

test('pressure-cell exports the runner', () => {
  assert.equal(typeof runOneCell, 'function');
});

test('pressure-cells-for lists model:effort cells for a listed agent file', () => {
  const cells = cellsFor('agents/orchestrator.md').split(',');
  assert.ok(cells.length > 0);
  for (const cell of cells) assert.match(cell, /^[^:]+:[^:]+$/);
});

test('pressure-cells-for refuses a file no kind lists', () => {
  assert.throws(() => cellsFor('agents/none.md'), /no kind in lib\/model-kinds.json lists 'agents\/none.md'/);
});

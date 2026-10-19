// The steps where exo makes options keep their forcing structure: candidates
// drawn apart by a seat and forbidden move, criteria scored at the pick, and a draft
// wider than the shown menu. These pin structure only; whether the options
// come out more varied is prose quality no unit test measures.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { sectionHeadings } from '../verify/checks/reference-shape.mjs';

const root = path.resolve(import.meta.dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const SKETCH = 'skills/spec/references/architecture-sketch.md';

function section(text, heading) {
  const lines = text.split('\n');
  const headings = sectionHeadings(lines);
  const at = headings.findIndex((entry) => entry.text === heading);
  if (at === -1) return null;
  const end = headings[at + 1]?.index ?? lines.length;
  return { order: at, body: lines.slice(headings[at].index + 1, end).join('\n') };
}

test('architecture sketch drafts one option per drawn seat and forbidden move, drops the likeliest shape, before screening', () => {
  const text = read(SKETCH);
  const draw = section(text, 'Draw the pairs');
  const draft = section(text, 'Draft one option per pair');
  const likely = section(text, 'Replace the likely');
  const screen = section(text, 'Screen each candidate');
  assert.ok(draw, 'no ## Draw the pairs section');
  assert.ok(draft, 'no ## Draft one option per pair section');
  assert.ok(likely, 'no ## Replace the likely section');
  assert.ok(screen, 'no ## Screen each candidate section');
  assert.ok(draw.order < draft.order && draft.order < likely.order && likely.order < screen.order, 'sections out of order');
  assert.match(draw.body, /draw-seats\.mjs/, 'seats are not drawn by the script');
  assert.match(draw.body, /a seat and a forbidden move/, 'pair is not a seat and a forbidden move');
  assert.match(draw.body, /never redraw/, 'redraw is not banned');
  assert.match(draft.body, /one option per pair/, 'no option per pair');
  assert.match(draft.body, /forbidden move fails/, 'forbidden move is not binding');
  assert.match(draft.body, /Core mechanism:[^\n]*`p=`/, 'no core mechanism and p estimate');
  assert.match(likely.body, /p above 0\.15[^\n]*redraft once from the same pair/, 'likeliest shape is not redrafted');
  assert.match(likely.body, /at least 2 options sit at p at most 0\.15/, 'no floor on unlikely options');
});

test('architecture sketch scores per criterion with a named graft and stops at the user pick', () => {
  const text = read(SKETCH);
  const pick = section(text, 'Show and pick');
  const stop = section(text, 'Stop at the options');
  assert.ok(pick, 'no ## Show and pick section');
  assert.ok(stop, 'no ## Stop at the options section');
  assert.match(pick.body, /3-5 criteria/, 'no criteria count');
  assert.match(pick.body, /per 3-5 criteria[^\n]*interface depth/, 'interface depth is not a criterion');
  assert.match(pick.body, /graft[^\n]*name each source/, 'no graft naming each source');
  assert.match(stop.body, /ask the user to pick one and stop/, 'run does not stop at the pick');
});

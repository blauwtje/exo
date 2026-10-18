// The steps where exo makes options keep their forcing structure: candidates
// drawn apart by named constraints, criteria set before scoring, and a draft
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

test('architecture sketch draws each candidate apart by a distinct named constraint before screening', () => {
  const text = read(SKETCH);
  const apart = section(text, 'Draw candidates apart');
  const screen = section(text, 'Screen each candidate');
  assert.ok(apart, 'no ## Draw candidates apart section');
  assert.ok(apart.order < screen.order, 'constraints come after screening');
  const constraints = [...apart.body.matchAll(/^\s+- \*\*([^*]+)\*\*/gm)].map((match) => match[1]);
  assert.ok(constraints.length >= 2, `only ${constraints.length} named constraint(s)`);
  assert.equal(new Set(constraints).size, constraints.length, 'constraint names repeat');
  assert.match(apart.body, /shape every candidate shares[^\n]*banned/, 'no redo with the shared shape banned');
});

test('architecture sketch sets criteria before sketching and picks per criterion with a named graft', () => {
  const text = read(SKETCH);
  const criteria = section(text, 'Set criteria first');
  const sketch = section(text, "Sketch, don't build");
  const pick = section(text, 'Pick per criterion');
  assert.ok(criteria, 'no ## Set criteria first section');
  assert.ok(criteria.order < sketch.order, 'criteria come after sketching');
  assert.match(criteria.body, /3-5 criteria/, 'no criteria count');
  assert.match(criteria.body, /interface depth/, 'interface depth is not a criterion');
  assert.ok(pick, 'no ## Pick per criterion section');
  assert.match(pick.body, /per criterion/, 'pick does not score per criterion');
  assert.match(pick.body, /graft[^\n]*name each source/, 'no graft naming each source');
});

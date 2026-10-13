import test from 'node:test';
import assert from 'node:assert/strict';
import { frameOf, parsePlan } from '../lib/plan-tasks.mjs';

const planWith = (appLines) => `# Plan

## Goal
Ship it.

## Plan basis
Repository: exo
Branch: main
${appLines}Land gate: npm run validate:static

## Success criterion
\`npm run check\`

### Task 1: feat(x): do it
Depends on: none | Files: \`a.mjs\` | Proof: node --test a.test.mjs
`;

const basisOf = (text) => frameOf(parsePlan(text).frame);

test('App line gives the start command and the ready URL', () => {
  const basis = basisOf(planWith('App: npm run dev | Ready: http://localhost:3000/health\n'));
  assert.deepEqual(basis.app, { start: 'npm run dev', ready: 'http://localhost:3000/health' });
});

test('App: none reads as no app', () => {
  assert.equal(basisOf(planWith('App: none\n')).app, null);
});

test('an absent App line reads as no app', () => {
  assert.equal(basisOf(planWith('')).app, null);
});

test('an App line without Ready: keeps the start command and an empty ready URL', () => {
  const basis = basisOf(planWith('App: npm run dev\n'));
  assert.deepEqual(basis.app, { start: 'npm run dev', ready: null });
});

test('the App line leaves the other basis fields alone', () => {
  const basis = basisOf(planWith('App: npm run dev | Ready: http://localhost:3000\n'));
  assert.equal(basis.landGate, 'npm run validate:static');
  assert.equal(basis.branch, 'main');
});

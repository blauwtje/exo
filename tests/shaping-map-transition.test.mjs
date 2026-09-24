// Behavioral tests for map-transition.mjs: adding decisions, applying one
// round's answer, and moving to the next round's picks, as pure functions on
// the raw map object.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { addDecisions, applyAnswer, nextRound } from '../skills/shaping/scripts/map-transition.mjs';

/** interview-page.md's example map, round 2: format closed as you, start
 *  closed by the code, range open and asked (Q2), layout waiting on range. */
function exampleMap() {
  return {
    lang: 'en',
    goal: 'Harbour masters get their tide alerts out of the app.',
    round: 2,
    words: {},
    decisions: [
      {
        id: 'format', name: 'What they receive', state: 'closed', number: 1, round: 1,
        question: 'What should a harbour master get when they export?',
        answer: 'PDF report', recommended: 'CSV file', closedBy: 'you'
      },
      { id: 'start', name: 'Where they start it', state: 'closed', answer: 'The alerts page', closedBy: 'code', evidence: 'src/modules/alerts/alerts.routes.mjs' },
      {
        id: 'range', name: 'Which alerts it covers', state: 'open', number: 2, waitsOn: 'format',
        question: 'Which alerts should one export hold?',
        changes: 'How long the report is.',
        why: 'Port reports run per quarter.',
        options: [
          { id: 'quarter', label: 'One quarter', gives: 'Only the last three months.', recommended: true },
          { id: 'all', label: 'Every alert', gives: 'The whole history in one file.' }
        ]
      },
      { id: 'layout', name: 'Page layout', state: 'waits', waitsOn: 'range' }
    ]
  };
}

describe('applyAnswer then nextRound', () => {
  it('closes a choice by place, opens the next decision, and drafts the round it cannot yet number', () => {
    const applied = applyAnswer(exampleMap(), { round: 2, answers: [{ decision: 'range', choice: 1 }] });
    const range = applied.map.decisions.find((decision) => decision.id === 'range');
    assert.equal(range.state, 'closed');
    assert.equal(range.answer, 'One quarter');
    assert.equal(range.closedBy, 'you');
    assert.equal(range.recommended, 'One quarter');
    assert.equal(range.question, 'Which alerts should one export hold?');
    assert.deepEqual(applied.lines, ['closed range Q2: One quarter (you)']);
    assert.equal(applied.map.round, 3);

    const moved = nextRound(applied.map);
    assert.deepEqual(moved.lines, ['opened layout', 'need layout', 'round=3 draft']);
    const layout = moved.map.decisions.find((decision) => decision.id === 'layout');
    assert.equal(layout.state, 'open');
  });

  it('closes a choice by option id', () => {
    const applied = applyAnswer(exampleMap(), { round: 2, answers: [{ decision: 'range', choice: 'all' }] });
    const range = applied.map.decisions.find((decision) => decision.id === 'range');
    assert.equal(range.answer, 'Every alert');
  });

  it('closes with ok on the answered round only', () => {
    const applied = applyAnswer(exampleMap(), { round: 2, ok: true, answers: [] });
    const range = applied.map.decisions.find((decision) => decision.id === 'range');
    assert.equal(range.state, 'closed');
    assert.equal(range.closedBy, 'you');
    assert.equal(range.answer, 'One quarter');
  });

  it('go closes every non-closed decision with options as exo, and needs a decision without them', () => {
    const map = exampleMap();
    const applied = applyAnswer(map, { round: 2, go: true, answers: [] });
    const range = applied.map.decisions.find((decision) => decision.id === 'range');
    const layout = applied.map.decisions.find((decision) => decision.id === 'layout');
    assert.equal(range.closedBy, 'exo');
    assert.equal(range.answer, 'One quarter');
    assert.equal(layout.state, 'waits');
    assert.ok(applied.lines.includes('need layout'));
  });

  it('own words beside a null choice leave the decision open and surface a read line', () => {
    const applied = applyAnswer(exampleMap(), { round: 2, answers: [{ decision: 'range', choice: null, words: 'Every quarter plus last year, actually.' }] });
    const range = applied.map.decisions.find((decision) => decision.id === 'range');
    assert.equal(range.state, 'open');
    assert.equal(range.number, 2);
    assert.deepEqual(applied.lines, ['read range: Every quarter plus last year, actually.']);
  });

  it('an answer naming neither choice nor words leaves the decision open with its number', () => {
    const applied = applyAnswer(exampleMap(), { round: 2, answers: [{ decision: 'range' }] });
    const range = applied.map.decisions.find((decision) => decision.id === 'range');
    assert.equal(range.state, 'open');
    assert.equal(range.number, 2);
    assert.deepEqual(applied.lines, []);
  });

  it('reopen returns a closed decision to open and its non-closed descendants to waits', () => {
    const map = exampleMap();
    map.decisions[2] = {
      id: 'range', name: 'Which alerts it covers', state: 'closed', number: 2, round: 2, waitsOn: 'format',
      question: 'Which alerts should one export hold?', changes: 'How long the report is.', why: 'Port reports run per quarter.',
      options: map.decisions[2].options, answer: 'One quarter', recommended: 'One quarter', closedBy: 'you'
    };
    map.decisions[3] = { id: 'layout', name: 'Page layout', state: 'open', number: 3, waitsOn: 'range' };
    const applied = applyAnswer(map, { round: 2, answers: [], reopen: ['range'] });
    const range = applied.map.decisions.find((decision) => decision.id === 'range');
    const layout = applied.map.decisions.find((decision) => decision.id === 'layout');
    assert.equal(range.state, 'open');
    assert.equal(range.number, 2);
    assert.equal(range.answer, undefined);
    assert.equal(range.closedBy, undefined);
    assert.equal(range.recommended, undefined);
    assert.equal(layout.state, 'waits');
    assert.equal(layout.number, undefined);
    assert.deepEqual(applied.lines, ['opened range']);
  });

  it('done with an empty reopen changes nothing but prints checkpoint=done', () => {
    const map = exampleMap();
    const applied = applyAnswer(map, { round: 2, answers: [], done: true });
    assert.deepEqual(applied.lines, ['checkpoint=done']);
    const range = applied.map.decisions.find((decision) => decision.id === 'range');
    assert.equal(range.state, 'open');
  });

  it('a top-level note prints as a note line', () => {
    const applied = applyAnswer(exampleMap(), { round: 2, answers: [], words: 'Keep it short.' });
    assert.deepEqual(applied.lines, ['note: Keep it short.']);
  });

  it('refuses an answer whose round does not match the map, guarding a double apply', () => {
    assert.throws(() => applyAnswer(exampleMap(), { round: 1, answers: [] }), /round/);
  });

  it('prints round=<r> checkpoint once every decision is closed', () => {
    const map = exampleMap();
    map.decisions[2].state = 'closed';
    map.decisions[2].answer = 'One quarter';
    map.decisions[2].closedBy = 'you';
    map.decisions[3] = { id: 'layout', name: 'Page layout', state: 'closed', waitsOn: 'range', answer: 'One page per week', closedBy: 'exo' };
    const moved = nextRound(map);
    assert.deepEqual(moved.lines, ['round=2 checkpoint']);
  });
});

describe('nextRound picking', () => {
  function readyDecision(id, waitsOn) {
    return {
      id, name: id, state: 'open', waitsOn,
      question: `${id}?`, changes: 'x', why: 'y',
      options: [{ id: 'a', label: 'A', gives: 'a', recommended: true }, { id: 'b', label: 'B', gives: 'b' }]
    };
  }

  it('picks numbered ready decisions first, keeps number continuity, and defers the rest', () => {
    const map = {
      round: 1,
      decisions: [
        { ...readyDecision('e'), number: 5 },
        readyDecision('a'),
        readyDecision('b'),
        readyDecision('c'),
        readyDecision('d')
      ]
    };
    const moved = nextRound(map);
    const picked = moved.map.decisions.filter((decision) => decision.round === 1).map((decision) => decision.id);
    assert.equal(picked.length, 4);
    assert.ok(picked.includes('e'));
    const newest = moved.map.decisions.find((decision) => decision.id !== 'e' && decision.round === 1);
    assert.ok(newest.number > 5);
    const deferred = moved.map.decisions.find((decision) => decision.round === undefined);
    assert.equal(deferred.number, undefined);
  });

  it('prefers the ready decision with the most non-closed descendants over map order', () => {
    const map = {
      round: 1,
      decisions: [
        readyDecision('solo'),
        readyDecision('hub'),
        { id: 'child1', name: 'child1', state: 'waits', waitsOn: 'hub' },
        { id: 'child2', name: 'child2', state: 'waits', waitsOn: 'hub' }
      ]
    };
    const moved = nextRound(map);
    const hub = moved.map.decisions.find((decision) => decision.id === 'hub');
    const solo = moved.map.decisions.find((decision) => decision.id === 'solo');
    assert.ok(hub.number < solo.number);
  });
});

describe('addDecisions', () => {
  it('creates a map from a null one at round 1', () => {
    const added = addDecisions(null, { goal: 'Ship it.', decisions: [{ id: 'x', name: 'X question' }] });
    assert.equal(added.map.round, 1);
    assert.equal(added.map.goal, 'Ship it.');
    const x = added.map.decisions.find((decision) => decision.id === 'x');
    assert.equal(x.state, 'open');
  });

  it('derives waits for a new decision whose parent is not closed', () => {
    const added = addDecisions(null, {
      goal: 'Ship it.',
      decisions: [{ id: 'p', name: 'Parent' }, { id: 'c', name: 'Child', waitsOn: 'p' }]
    });
    const child = added.map.decisions.find((decision) => decision.id === 'c');
    assert.equal(child.state, 'waits');
  });

  it('merges fields onto an existing non-closed decision', () => {
    const map = exampleMap();
    const added = addDecisions(map, { decisions: [{ id: 'layout', question: 'Which layout?', changes: 'x', why: 'y', options: [{ id: 'a', label: 'A', gives: 'a', recommended: true }, { id: 'b', label: 'B', gives: 'b' }] }] });
    const layout = added.map.decisions.find((decision) => decision.id === 'layout');
    assert.equal(layout.question, 'Which layout?');
    assert.equal(layout.state, 'waits');
  });

  it('refuses a given number, a given round, and an already-closed id, naming the field', () => {
    const map = exampleMap();
    assert.throws(() => addDecisions(map, { decisions: [{ id: 'new', name: 'New', number: 9 }] }), /number/);
    assert.throws(() => addDecisions(map, { decisions: [{ id: 'new', name: 'New', round: 1 }] }), /round/);
    assert.throws(() => addDecisions(map, { decisions: [{ id: 'format', name: 'What they receive' }] }), /closed/);
  });
});

// Behavioral tests for round-text.mjs: the chat layout for a round and for
// the checkpoint, drawn from a map already checked. No import from
// question-page.mjs, so the fixtures carry their own words.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { renderText, TEXT_WORDS } from '../skills/shaping/scripts/round-text.mjs';

const WORDS = {
  round: 'Round {r} · {k} still open',
  question: 'Q{n}',
  changes: 'Changes',
  recommended: 'Recommended',
  why: 'Why 1',
  ...TEXT_WORDS
};

/** Round 2 of an export interview: one earlier answer, two ready questions,
 *  the second's recommended option listed first in the raw map to prove the
 *  text sorts it forward rather than printing map order. */
function twoQuestionRound() {
  return {
    lang: 'en',
    goal: 'Harbour masters get their tide alerts out of the app.',
    round: 2,
    words: WORDS,
    decisions: [
      { id: 'format', name: 'What they receive', state: 'closed', number: 1, round: 1, answer: 'PDF report', closedBy: 'you' },
      {
        id: 'range', name: 'Which alerts it covers', state: 'open', number: 2, round: 2,
        question: 'Which alerts should one export hold?',
        changes: 'How long the report is.',
        why: 'Port reports run per quarter.',
        options: [
          { id: 'all', label: 'Every alert', gives: 'The whole history in one file.' },
          { id: 'quarter', label: 'One quarter', gives: 'Only the last three months.', recommended: true }
        ]
      },
      {
        id: 'channel', name: 'Which channel it sends through', state: 'open', number: 3, round: 2,
        question: 'Where should the export go?',
        changes: 'Where the file lands.',
        why: 'Harbour masters check email, not the app.',
        options: [
          { id: 'email', label: 'Email', gives: 'Sent to their inbox.', recommended: true },
          { id: 'download', label: 'Download', gives: 'Kept in the app only.' }
        ]
      }
    ]
  };
}

/** Round 1 with three open decisions: one asked, one waiting on it, one root
 *  decision deferred past round 1 for lack of room. */
function firstRoundOverview() {
  return {
    lang: 'en',
    goal: 'Harbour masters get their tide alerts out of the app.',
    round: 1,
    words: WORDS,
    decisions: [
      {
        id: 'format', name: 'What they receive', state: 'open', number: 1, round: 1,
        question: 'What should a harbour master get when they export?',
        changes: 'The file they download.',
        why: 'A CSV opens in their existing spreadsheet.',
        options: [
          { id: 'pdf', label: 'PDF report', gives: 'A formatted document.' },
          { id: 'csv', label: 'CSV file', gives: 'Rows they can filter.', recommended: true }
        ]
      },
      { id: 'range', name: 'Which alerts it covers', state: 'waits', waitsOn: 'format' },
      { id: 'layout', name: 'Page layout', state: 'open', waitsOn: undefined, round: 2 }
    ]
  };
}

/** Round 2 with a third decision numbered ahead of its turn: more than
 *  ROUND_MAX decisions were ready, so map-transition gave it a number but
 *  pushed its round to 3. It must not read as asked at round 2. */
function roundWithDeferredPick() {
  return {
    lang: 'en',
    goal: 'Harbour masters get their tide alerts out of the app.',
    round: 2,
    words: WORDS,
    decisions: [
      {
        id: 'range', name: 'Which alerts it covers', state: 'open', number: 2, round: 2,
        question: 'Which alerts should one export hold?',
        changes: 'How long the report is.',
        why: 'Port reports run per quarter.',
        options: [
          { id: 'all', label: 'Every alert', gives: 'The whole history in one file.' },
          { id: 'quarter', label: 'One quarter', gives: 'Only the last three months.', recommended: true }
        ]
      },
      {
        id: 'layout', name: 'Page layout', state: 'open', number: 4, round: 3,
        question: 'How should the export lay out?',
        changes: 'The page layout.',
        why: 'Layout matters.',
        options: [
          { id: 'grid', label: 'Grid', gives: 'A grid layout.', recommended: true }
        ]
      }
    ]
  };
}

function checkpointMap() {
  return {
    lang: 'en',
    goal: 'Harbour masters get their tide alerts out of the app.',
    round: 3,
    words: WORDS,
    decisions: [
      { id: 'format', name: 'What they receive', state: 'closed', number: 1, answer: 'CSV file', closedBy: 'you' },
      { id: 'start', name: 'Where they start it', state: 'closed', answer: 'The alerts page', closedBy: 'code', evidence: 'src/modules/alerts/alerts.routes.mjs' },
      { id: 'range', name: 'Which alerts it covers', state: 'closed', number: 2, answer: 'One quarter', closedBy: 'exo' }
    ]
  };
}

describe('renderText, a round', () => {
  const text = renderText(twoQuestionRound());

  it('opens with the round line', () => {
    assert.match(text, /^Round 2 · 2 still open/);
  });

  it('cards each ready question by number and name', () => {
    assert.match(text, /\*\*Q2 · Which alerts it covers\*\*/);
    assert.match(text, /\*\*Q3 · Which channel it sends through\*\*/);
  });

  it('lists options recommended first regardless of map order', () => {
    const card = text.split('---')[0];
    assert.match(card, /1\. \*\*One quarter \(Recommended\)\*\*: Only the last three months\./);
    assert.match(card, /2\. \*\*Every alert\*\*: The whole history in one file\./);
  });

  it('prints the why line and the answer hint', () => {
    assert.match(text, /Why 1: Port reports run per quarter\./);
    assert.ok(text.endsWith(TEXT_WORDS.answerHint));
  });

  it('separates cards with a rule', () => {
    assert.equal(text.split('---').length, 2);
  });

  it('carries no overview above round 2', () => {
    assert.ok(!text.includes('still open\n\n-'));
  });
});

describe('renderText, the round-1 overview', () => {
  const text = renderText(firstRoundOverview());

  it('lists all three open decisions before the round line', () => {
    const overview = text.split('\n\nRound')[0];
    assert.equal(overview, [
      '- What they receive: round 1',
      '- Which alerts it covers: waits on What they receive',
      '- Page layout: round 2'
    ].join('\n'));
  });
});

describe('renderText, a decision numbered ahead of this round', () => {
  const text = renderText(roundWithDeferredPick());

  it('cards only the decision whose round matches map.round', () => {
    assert.match(text, /\*\*Q2 · Which alerts it covers\*\*/);
    assert.ok(!text.includes('Q4 · Page layout'));
  });

  it('does not separate cards with a rule when only one is asked', () => {
    assert.ok(!text.includes('---'));
  });
});

describe('renderText, the checkpoint', () => {
  const text = renderText(checkpointMap());

  it('numbers a decision that was asked and leaves the code path bare', () => {
    assert.match(text, /^Q1 · What they receive: CSV file \(you\)/m);
    assert.match(text, /^Where they start it: The alerts page \(code: src\/modules\/alerts\/alerts\.routes\.mjs\)/m);
    assert.match(text, /^Q2 · Which alerts it covers: One quarter \(exo\)/m);
  });

  it('ends on the write-or-change choice', () => {
    assert.ok(text.endsWith('2. **Change something**: the questions you name return as the next round.'));
    assert.match(text, /1\. \*\*Write the spec \(Recommended\)\*\*: exo writes the brief from these decisions\./);
  });
});

// Behavioral tests for question-page.mjs: the map it refuses, the round it
// draws from one, the answer it reads from the fields the tab records, and the
// line --ask prints once the tab records a round. No browser opens: the tab
// server runs with --no-open.

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { fixture, jsonFixture, run } from './harness.mjs';
import { checkedMap, renderRound, roundAnswer } from '../skills/shaping/scripts/question-page.mjs';

const QUESTION_PAGE = fileURLToPath(new URL('../skills/shaping/scripts/question-page.mjs', import.meta.url));
const ANSWER_RETRY_MS = 200;
const ANSWER_ATTEMPTS = 40;

/** Round 2 of an export interview: two questions answered in round 1, one
 *  settled by the code, one asked now and one waiting on it. */
function roundMap() {
  return {
    lang: 'en',
    goal: 'Harbour masters get their tide alerts out of the app.',
    round: 2,
    decisions: [
      {
        id: 'format', name: 'What they receive', state: 'closed', number: 1, round: 1,
        question: 'What should a harbour master get when they export?',
        answer: 'PDF report', recommended: 'CSV file', closedBy: 'you'
      },
      {
        id: 'who', name: 'Who can export', state: 'closed', number: 2, round: 1,
        question: 'Which users may start an export?',
        answer: 'Admins only', recommended: 'Admins only', closedBy: 'you'
      },
      { id: 'start', name: 'Where they start it', state: 'closed', answer: 'The alerts page', closedBy: 'code', evidence: 'src/modules/alerts/alerts.routes.mjs' },
      {
        id: 'range', name: 'Which alerts it covers', state: 'open', number: 3, waitsOn: 'format',
        question: 'Which alerts should one export hold?',
        changes: 'How long the report is.',
        why: 'Port reports run per quarter.',
        options: [
          { id: 'all', label: 'Every alert', gives: 'The whole history in one file.' },
          { id: 'quarter', label: 'One quarter', gives: 'Only the last three months.', recommended: true }
        ]
      },
      { id: 'layout', name: 'Page layout', state: 'waits', waitsOn: 'range' }
    ]
  };
}

/** The same map once every decision is closed: the checkpoint. */
function checkpointMap() {
  const map = roundMap();
  map.decisions[3] = {
    id: 'range', name: 'Which alerts it covers', state: 'closed', number: 3, round: 2, waitsOn: 'format',
    question: 'Which alerts should one export hold?', answer: 'One quarter', recommended: 'One quarter', closedBy: 'you'
  };
  map.decisions[4] = { id: 'layout', name: 'Page layout', state: 'closed', waitsOn: 'range', answer: 'One page per week', closedBy: 'exo' };
  return map;
}

/** Start the tab through question-page.mjs and resolve its URL from stderr. */
function startServe(folder, mapFile) {
  const child = spawn(process.execPath, [QUESTION_PAGE, '--serve', folder, '--map', mapFile, '--no-open']);
  let stderr = '';
  const url = new Promise((resolve, reject) => {
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
      const match = /sketch tab: URL (http:\/\/127\.0\.0\.1:\d+\/\?key=[0-9a-f]+)/.exec(stderr);
      if (match) resolve(new URL(match[1]));
    });
    child.on('close', () => reject(new Error(`the tab left before printing its URL: ${stderr}`)));
  });
  return { child, url };
}

describe('question-page.mjs', () => {
  it('names the field of a map it refuses', () => {
    const roundless = roundMap();
    delete roundless.round;
    assert.throws(() => checkedMap(roundless), /round must be a whole number from 1/);

    const twoRecommended = roundMap();
    twoRecommended.decisions[3].options[0].recommended = true;
    assert.throws(() => checkedMap(twoRecommended), /decisions\[3\]\.options must mark exactly one answer recommended, received 2/);

    const crowded = roundMap();
    crowded.decisions[3].options = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id, label: id, gives: id }));
    assert.throws(() => checkedMap(crowded), /decisions\[3\]\.options must hold 2 to 4 answers, received 5/);

    const reasonless = roundMap();
    delete reasonless.decisions[3].why;
    assert.throws(() => checkedMap(reasonless), /decisions\[3\]\.why must be a non-empty string/);

    const circular = roundMap();
    circular.decisions[0].waitsOn = 'layout';
    assert.throws(() => checkedMap(circular), /waits on itself/);

    const sameNumber = roundMap();
    sameNumber.decisions[3].number = 2;
    assert.throws(() => checkedMap(sameNumber), /question number 2 appears twice/);

    const nothingAsked = roundMap();
    delete nothingAsked.decisions[3].number;
    assert.throws(() => checkedMap(nothingAsked), /no open decision carries a number to ask/);
  });

  it('refuses a round of more than four asked decisions, and a decision asked before the open parent it waits on closes', () => {
    const askedLike = (id, number) => ({
      id, name: id, state: 'open', number, waitsOn: 'format', question: `${id}?`, changes: 'c', why: 'w',
      options: [{ id: 'a', label: 'A', gives: 'a', recommended: true }, { id: 'b', label: 'B', gives: 'b' }]
    });
    const crowded = roundMap();
    crowded.decisions.push(askedLike('extra1', 4), askedLike('extra2', 5), askedLike('extra3', 6), askedLike('extra4', 7));
    assert.throws(() => checkedMap(crowded), /a round asks at most 4 decisions, received 5/);

    const tooSoon = roundMap();
    tooSoon.decisions[4] = { ...askedLike('layout', 4), waitsOn: 'range' };
    assert.throws(() => checkedMap(tooSoon), /'layout' is asked while 'range' it waits on is still open/);
  });

  it('opens a decision by itself once the parent it waits on has closed', () => {
    const map = roundMap();
    map.decisions[4].waitsOn = 'format';
    const checked = checkedMap(map);
    assert.equal(checked.decisions.find((decision) => decision.id === 'layout').state, 'open');
  });

  it('draws each question of the round with its text, numbered options and the recommended one first', () => {
    const page = renderRound(checkedMap(roundMap()));
    assert.match(page, /^<title>Round 2 · 2 still open<\/title>/);
    assert.match(page, /<h2 id="question-range" class="card-question">Which alerts should one export hold\?<\/h2>/);
    assert.match(page, /<span class="card-number">Q3<\/span> · Which alerts it covers/);
    const values = [...page.matchAll(/name="choice-range" value="([^"]+)"/g)].map((match) => match[1]);
    assert.deepEqual(values, ['quarter', 'all'], 'the recommended answer comes first');
    const numbers = [...page.matchAll(/<span class="option-number">(\d+)\.<\/span>/g)].map((match) => match[1]);
    assert.deepEqual(numbers, ['1', '2']);
    assert.match(page, /<li class="option option-recommended">[^]*?One quarter[^]*?<span class="badge">Recommended<\/span>/);
    assert.match(page, /<span class="term">Why 1:<\/span> Port reports run per quarter\./);
    assert.match(page, /name="words-range"/);
    const buttons = [...page.matchAll(/data-choice="([^"]+)"/g)].map((match) => match[1]);
    assert.deepEqual(buttons, ['round', 'recommended', 'go']);
    assert.ok(!/https?:\/\//.test(page), 'the page loads nothing from outside');
  });

  it('draws earlier rounds with the choice, the recommendation, who closed it, what it unlocked and a Change control', () => {
    const page = renderRound(checkedMap(roundMap()));
    assert.match(page, /<details><summary>Round 1<\/summary>/);
    assert.match(page, /<span class="term">You chose:<\/span> PDF report/);
    assert.match(page, /<span class="term">Recommended:<\/span> CSV file<\/p>/);
    assert.match(page, /<span class="term">Recommended:<\/span> Admins only \(as recommended\)/);
    assert.match(page, /<span class="term">Unlocked:<\/span> Which alerts it covers/);
    assert.match(page, /The code settles it \(src\/modules\/alerts\/alerts\.routes\.mjs\):<\/span> The alerts page/);
    const reopen = [...page.matchAll(/name="reopen-([^"]+)"/g)].map((match) => match[1]);
    assert.deepEqual(reopen, ['format', 'who', 'start']);
  });

  it('draws the tree beside the round, each decision with its state', () => {
    const page = renderRound(checkedMap(roundMap()));
    assert.match(page, /class="node node-closed" style="--depth: 0"><span class="node-name">What they receive/);
    assert.match(page, /class="node node-asking" style="--depth: 1" aria-current="step"><span class="node-name">Which alerts it covers<\/span><span class="node-state">This round: Q3/);
    assert.match(page, /class="node node-waits" style="--depth: 2"><span class="node-name">Page layout<\/span><span class="node-state">Waits on: Which alerts it covers/);
  });

  it('escapes every text the map carries', () => {
    const hostile = roundMap();
    hostile.decisions[4].name = '<script>alert(1)</script>';
    hostile.decisions[3].options[0].gives = '"><img src=x onerror=alert(1)>';
    const page = renderRound(checkedMap(hostile));
    assert.ok(!page.includes('<script>alert'));
    assert.ok(!page.includes('<img'));
    assert.ok(page.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  });

  it('draws the checkpoint once every decision is closed, every round open to read', () => {
    const page = renderRound(checkedMap(checkpointMap()));
    assert.match(page, /^<title>Is this what we mean\?<\/title>/);
    const buttons = [...page.matchAll(/data-choice="([^"]+)"/g)].map((match) => match[1]);
    assert.deepEqual(buttons, ['done', 'change']);
    assert.match(page, /<details open><summary>Round 2<\/summary>/);
    assert.match(page, /<span class="term">exo chose:<\/span> One page per week/);
  });

  it('reads one answer per question from the fields, and the earlier decisions marked to change', () => {
    const map = checkedMap(roundMap());
    const sent = roundAnswer(map, { choice: 'round', steer: '', fields: { 'choice-range': 'all', 'words-range': ' ', 'reopen-format': 'on' } });
    assert.deepEqual(sent, {
      round: 2, answers: [{ decision: 'range', choice: 'all', label: 'Every alert', words: '' }],
      reopen: ['format'], go: false, done: false, words: ''
    });
    const unknown = roundAnswer(map, { choice: 'round', steer: '', fields: { 'choice-range': 'forged' } });
    assert.deepEqual(unknown.answers, [{ decision: 'range', choice: null, label: '', words: '' }], 'an answer the page did not offer leaves the question open');
    const recommended = roundAnswer(map, { choice: 'recommended', steer: '', fields: {} });
    assert.deepEqual(recommended.answers, [{ decision: 'range', choice: 'quarter', label: 'One quarter', words: '' }]);
    const go = roundAnswer(map, { choice: 'go', steer: '', fields: {} });
    assert.equal(go.go, true);
    assert.equal(go.answers[0].choice, 'quarter');
    const note = roundAnswer(map, { choice: null, steer: 'skip the layout question' });
    assert.deepEqual(note.answers, [{ decision: 'range', choice: null, label: '', words: '' }]);
    assert.equal(note.words, 'skip the layout question');
  });

  it('confirms the checkpoint only when nothing is marked to change', () => {
    const map = checkedMap(checkpointMap());
    assert.equal(roundAnswer(map, { choice: 'done', steer: '', fields: {} }).done, true);
    const changed = roundAnswer(map, { choice: 'done', steer: '', fields: { 'reopen-range': 'on' } });
    assert.equal(changed.done, false);
    assert.deepEqual(changed.reopen, ['range']);
  });

  it('exits 2 without a mode or a map', async () => {
    const folder = await fixture();
    const neither = await run(QUESTION_PAGE, []);
    assert.equal(neither.code, 2);
    assert.match(neither.stderr, /exactly one of --serve <dir>, --ask <dir>, and --add\/--apply\/--text/);
    const mapless = await run(QUESTION_PAGE, ['--ask', folder]);
    assert.equal(mapless.code, 2);
    assert.match(mapless.stderr, /--map <map\.json> is required/);
  });

  it('prints its own line on exit 3, so the recommended option is never taken for the user', async () => {
    const folder = await fixture();
    const mapFile = await jsonFixture('map.json', roundMap());
    const alone = await run(QUESTION_PAGE, ['--ask', path.join(folder, 'questions'), '--map', mapFile, '--timeout', '6']);
    assert.equal(alone.code, 3);
    assert.match(alone.stderr, /no tab server runs for this folder/, 'the child still prints its own line');
    assert.match(alone.stderr, /question page: no answer to draw from; ask this round in the conversation, never pick for the user/);
  });

  it('prints the sent round as one line', async () => {
    const folder = await fixture();
    const mapFile = await jsonFixture('map.json', roundMap());
    const { child, url } = startServe(path.join(folder, 'questions'), mapFile);
    try {
      const tab = await url;
      const asking = run(QUESTION_PAGE, ['--ask', path.join(folder, 'questions'), '--map', mapFile, '--timeout', '20']);
      const sent = {
        sketch: '001-round-2.html', choice: 'round', label: 'Send answers', steer: '',
        fields: { 'choice-range': 'quarter', 'words-range': '', 'reopen-who': 'on' }
      };
      let delivered = false;
      for (let attempt = 0; attempt < ANSWER_ATTEMPTS && !delivered; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, ANSWER_RETRY_MS));
        const response = await fetch(`${tab.origin}/answer${tab.search}`, {
          method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(sent)
        });
        delivered = response.ok;
      }
      assert.ok(delivered, 'the tab took the round once it had picked the page up');
      const asked = await asking;
      assert.equal(asked.code, 0, asked.stderr);
      assert.deepEqual(JSON.parse(asked.stdout), {
        round: 2, answers: [{ decision: 'range', choice: 'quarter', label: 'One quarter', words: '' }],
        reopen: ['who'], go: false, done: false, words: ''
      });
    } finally {
      child.kill('SIGTERM');
    }
  });
});

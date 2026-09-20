// Behavioral tests for question-page.mjs: the map it refuses, the page it
// draws from one, and the line --ask prints once the tab records a click.
// No browser opens: the tab server runs with --no-open.

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { fixture, jsonFixture, run } from './harness.mjs';
import { checkedMap, renderQuestion } from '../skills/shaping/scripts/question-page.mjs';

const QUESTION_PAGE = fileURLToPath(new URL('../skills/shaping/scripts/question-page.mjs', import.meta.url));
const ANSWER_RETRY_MS = 200;
const ANSWER_ATTEMPTS = 40;

function exportMap() {
  return {
    lang: 'en',
    goal: 'Harbour masters get their tide alerts out of the app.',
    asked: 'format',
    decisions: [
      {
        id: 'format', name: 'What they receive', state: 'open',
        question: 'What should a harbour master get when they export?',
        changes: 'It decides what the port authority receives each quarter.',
        options: [
          { id: 'pdf', label: 'PDF report', gives: 'Formatted pages, not editable.' },
          { id: 'csv', label: 'CSV file', gives: 'One row per alert, opens in a spreadsheet.', recommended: true }
        ]
      },
      { id: 'range', name: 'Which alerts it covers', state: 'waits', waitsOn: 'format' },
      { id: 'start', name: 'Where they start it', state: 'closed', answer: 'The alerts page', closedBy: 'code', evidence: 'src/modules/alerts/alerts.routes.mjs' }
    ]
  };
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
    const closedAsked = exportMap();
    closedAsked.asked = 'start';
    assert.throws(() => checkedMap(closedAsked), /asked names 'start', whose state is not open/);

    const crowded = exportMap();
    crowded.decisions[0].options = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id, label: id, gives: id }));
    assert.throws(() => checkedMap(crowded), /decisions\[0\]\.options must hold 2 to 4 answers, received 5/);

    const reserved = exportMap();
    reserved.decisions[0].options[0].id = 'go';
    assert.throws(() => checkedMap(reserved), /decisions\[0\]\.options\[0\]\.id 'go'/);

    const early = exportMap();
    early.asked = null;
    assert.throws(() => checkedMap(early), /closing review, while a decision is still open/);
  });

  it('draws the recommended answer first, Go last, and every decision with its state', () => {
    const page = renderQuestion(checkedMap(exportMap()));
    assert.match(page, /^<title>What should a harbour master get when they export\?<\/title>/);
    const choices = [...page.matchAll(/data-choice="([^"]+)"/g)].map((match) => match[1]);
    assert.deepEqual(choices, ['csv', 'pdf', 'go']);
    assert.match(page, /Question 1, 2 still open/);
    assert.match(page, /aria-current="step"><span class="decision-name">What they receive/);
    assert.match(page, /Waits on: What they receive/);
    assert.match(page, /The code settles it \(src\/modules\/alerts\/alerts\.routes\.mjs\): The alerts page/);
    assert.ok(!/https?:\/\//.test(page), 'the page loads nothing from outside');
  });

  it('escapes every text the map carries', () => {
    const hostile = exportMap();
    hostile.decisions[1].name = '<script>alert(1)</script>';
    hostile.decisions[0].options[0].gives = '"><img src=x onerror=alert(1)>';
    const page = renderQuestion(checkedMap(hostile));
    assert.ok(!page.includes('<script>alert'));
    assert.ok(!page.includes('<img'));
    assert.ok(page.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  });

  it('draws the closing review with one choice once every decision is closed', () => {
    const closed = exportMap();
    closed.asked = null;
    closed.decisions[0] = { id: 'format', name: 'What they receive', state: 'closed', answer: 'CSV file', closedBy: 'you' };
    closed.decisions[1] = { id: 'range', name: 'Which alerts it covers', state: 'closed', answer: 'One quarter', closedBy: 'exo' };
    const page = renderQuestion(checkedMap(closed));
    const choices = [...page.matchAll(/data-choice="([^"]+)"/g)].map((match) => match[1]);
    assert.deepEqual(choices, ['done']);
    assert.match(page, /You chose: CSV file/);
    assert.match(page, /exo chose: One quarter/);
  });

  it('exits 2 without a mode or a map', async () => {
    const folder = await fixture();
    const neither = await run(QUESTION_PAGE, []);
    assert.equal(neither.code, 2);
    assert.match(neither.stderr, /exactly one of --serve <dir> and --ask <dir>/);
    const mapless = await run(QUESTION_PAGE, ['--ask', folder]);
    assert.equal(mapless.code, 2);
    assert.match(mapless.stderr, /--map <map\.json> is required/);
  });

  it('prints the clicked answer as one line', async () => {
    const folder = await fixture();
    const mapFile = await jsonFixture('map.json', exportMap());
    const { child, url } = startServe(path.join(folder, 'questions'), mapFile);
    try {
      const tab = await url;
      const asking = run(QUESTION_PAGE, ['--ask', path.join(folder, 'questions'), '--map', mapFile, '--timeout', '20']);
      const answer = { sketch: '001-format.html', choice: 'csv', label: 'CSV file', steer: '' };
      let delivered = false;
      for (let attempt = 0; attempt < ANSWER_ATTEMPTS && !delivered; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, ANSWER_RETRY_MS));
        const response = await fetch(`${tab.origin}/answer${tab.search}`, {
          method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(answer)
        });
        delivered = response.ok;
      }
      assert.ok(delivered, 'the tab took the answer once it had picked the question up');
      const asked = await asking;
      assert.equal(asked.code, 0, asked.stderr);
      assert.deepEqual(JSON.parse(asked.stdout), { decision: 'format', choice: 'csv', label: 'CSV file', words: '', go: false });
    } finally {
      child.kill('SIGTERM');
    }
  });
});

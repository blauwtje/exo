// Behavioral tests for sketch-tab.mjs: the usage contract, one tab that takes
// every newer sketch over the same stream, the guarded answer a fake browser
// posts, the line --wait prints for it, and the ways the server leaves.
// No browser opens: every server runs with --no-open.

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fixture, jsonFixture, run, script, SCRIPTS } from './harness.mjs';
import { optionName, tabPage } from '../skills/design-ui/scripts/sketch-tab.mjs';

const SKETCH_TAB = script('sketch-tab.mjs');
const PALETTE = `<title>Welke kleuren passen bij de haven?</title>
<style>.swatch{padding:24px}</style>
<div class="swatch" data-choice="zee" style="background:#0b3954;color:#fff">Zee</div>
<button type="button" data-choice='zand' style="background:#e8d8b9">Zand</button>`;

/** Start the tab server and resolve its URL from stderr while it keeps running. */
function startTab(folder, extra = []) {
  const child = spawn(process.execPath, [SKETCH_TAB, '--serve', folder, '--no-open', ...extra], { cwd: SCRIPTS });
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  const exit = new Promise((resolve) => child.on('close', (code) => resolve({ code, stderr })));
  const url = new Promise((resolve, reject) => {
    child.stderr.on('data', () => {
      const match = /sketch tab: URL (http:\/\/127\.0\.0\.1:\d+\/\?key=[0-9a-f]+)/.exec(stderr);
      if (match) resolve(new URL(match[1]));
    });
    child.on('close', () => reject(new Error(`sketch-tab.mjs exited before printing a URL: ${stderr}`)));
  });
  url.catch(() => {});
  return { url, exit, stderr: () => stderr, stop: () => child.kill('SIGTERM') };
}

/** The three reads optionName makes of an option element, without a browser. */
function optionElement({ ariaLabel = null, heading = null, text }) {
  return {
    getAttribute: (name) => (name === 'aria-label' ? ariaLabel : null),
    querySelector: () => (heading === null ? null : { textContent: heading }),
    textContent: text
  };
}

const TAB_WORDS = {
  lang: 'en', waiting: 'waiting', fallbackQuestion: 'fallback', hint: 'hint',
  steer: 'steer', send: 'send', received: 'received', failed: 'failed', lost: 'lost'
};

/** A stand-in DOM element: a plain object whose only behaviour is the
 *  addEventListener a fake element needs, captured by event type. */
function fakeElement(extra = {}) {
  const handlers = {};
  return { addEventListener: (type, handler) => { handlers[type] = handler; }, handlers, ...extra };
}

/** Runs the tab chrome's own <script>, the code a real browser executes for
 *  the tab page, against fake elements and no network: proof of what the
 *  footer's note actually sends, without opening a browser. */
function runTabScript() {
  const html = tabPage('k', TAB_WORDS);
  const body = /<script>([\s\S]*)<\/script>\s*<\/body>/.exec(html)[1];
  const frame = fakeElement({ contentWindow: { postMessage: () => {} } });
  const question = fakeElement({ set textContent(_v) {} });
  const status = fakeElement({ set textContent(_v) {} });
  const steer = fakeElement({ value: '' });
  const send = fakeElement({ disabled: false });
  const elements = { sketch: frame, question, status, steer, send };
  const document = { getElementById: (id) => elements[id], addEventListener: () => {}, hidden: false, set title(_v) {} };
  const messageHandlers = [];
  const globalAddEventListener = (type, handler) => { if (type === 'message') messageHandlers.push(handler); };
  const fetchCalls = [];
  const fetchImpl = (url, options) => {
    fetchCalls.push(JSON.parse(options.body));
    return Promise.resolve({ ok: true });
  };
  let source;
  class FakeEventSource { constructor() { source = this; } }
  // eslint-disable-next-line no-new-func
  const run = new Function('document', 'EventSource', 'fetch', 'addEventListener', body);
  run(document, FakeEventSource, fetchImpl, globalAddEventListener);
  source.onmessage({ data: JSON.stringify({ sketch: 'x.html', version: 1, question: 'Q' }) });
  return { steer, send, frame, messageHandlers, fetchCalls };
}

/** The tab's event stream, read the way the page's EventSource reads it. */
async function openEvents(url) {
  const abort = new AbortController();
  const response = await fetch(`${url.origin}/events${url.search}`, { signal: abort.signal });
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffered = '';
  async function next() {
    for (;;) {
      const end = buffered.indexOf('\n\n');
      if (end >= 0) {
        const event = buffered.slice(0, end);
        buffered = buffered.slice(end + 2);
        return JSON.parse(event.replace(/^data: /, ''));
      }
      const { value, done } = await reader.read();
      if (done) throw new Error('the event stream ended');
      buffered += decoder.decode(value, { stream: true });
    }
  }
  return { status: response.status, next, close: () => abort.abort() };
}

function answer(url, body, headers = { 'content-type': 'application/json' }) {
  return fetch(`${url.origin}/answer${url.search}`, { method: 'POST', headers, body: JSON.stringify(body) });
}

describe('sketch-tab.mjs', () => {
  it('exits 2 unless exactly one of --serve and --wait is given, and --wait names its sketch', async () => {
    const neither = await run(SKETCH_TAB, ['--no-open']);
    assert.equal(neither.code, 2);
    assert.match(neither.stderr, /exactly one of --serve <dir> and --wait <dir>/);

    const folder = await fixture();
    const unnamed = await run(SKETCH_TAB, ['--wait', folder]);
    assert.equal(unnamed.code, 2);
    assert.match(unnamed.stderr, /--wait needs --sketch/);

    const escaping = await run(SKETCH_TAB, ['--wait', folder, '--sketch', '../001.html']);
    assert.equal(escaping.code, 2, 'a sketch is a file name inside the folder, never a path');
  });

  it('opens one tab page that waits, with a sandboxed frame and no inline handler', async () => {
    const folder = await fixture();
    const tab = startTab(folder);
    try {
      const url = await tab.url;
      const page = await fetch(url);
      assert.equal(page.status, 200);
      const html = await page.text();
      assert.match(html, /<iframe id="sketch" sandbox="allow-scripts"/);
      assert.match(html, /The first sketch is on its way\./);
      assert.match(html, /<label for="steer">/);
      assert.doesNotMatch(html, /\son[a-z]+\s*=\s*["'][^"']/i, 'no inline event handler');

      const keyless = await fetch(`${url.origin}/`);
      assert.equal(keyless.status, 403, 'the per-run key guards the page');

      const events = await openEvents(url);
      assert.deepEqual(await events.next(), { sketch: null, version: null, question: '' });
      events.close();
    } finally {
      tab.stop();
      await tab.exit;
    }
  });

  it('shows a written sketch within a second, and its revision in the same tab', async () => {
    const folder = await fixture();
    const tab = startTab(folder);
    try {
      const url = await tab.url;
      const key = url.searchParams.get('key');
      const events = await openEvents(url);
      await events.next();

      const writtenAt = Date.now();
      await fs.writeFile(path.join(folder, '001-palette.html'), PALETTE);
      const first = await events.next();
      assert.ok(Date.now() - writtenAt < 1000, 'one file write reaches the tab in under a second');
      assert.equal(first.sketch, '001-palette.html');
      assert.equal(first.question, 'Welke kleuren passen bij de haven?');

      const served = await fetch(`${url.origin}/k/${key}/sketch/001-palette.html`);
      assert.equal(served.status, 200);
      const html = await served.text();
      assert.match(html, /^<!doctype html>/, 'a fragment is wrapped in the structural shell');
      assert.doesNotMatch(html, /<title>/, 'the question moves to the tab and leaves the sketch');
      assert.match(html, /data-choice="zee"/);
      assert.match(html, /sketchChoice/, 'the shim that hands a click to the tab is injected');
      assert.ok(html.includes(String(optionName)), 'the shim names an option with the function tested below');
      assert.match(tab.stderr(), /sketch tab: shown 001-palette\.html \d+\.\ds after it was written/);

      await new Promise((resolve) => { setTimeout(resolve, 20); });
      await fs.writeFile(path.join(folder, '002-palette.html'), PALETTE.replace('Zand', 'Duin'));
      const second = await events.next();
      assert.equal(second.sketch, '002-palette.html', 'the newest file replaces the one on screen');
      assert.notEqual(second.version, first.version);
      events.close();
    } finally {
      tab.stop();
      await tab.exit;
    }
  });

  it('names an option by its aria-label, then its first heading, then the first 40 characters of its text', () => {
    const cardText = '\n  Zee (aanbevolen)\n  Bewaar je antwoord op de schets\n  Bewaren\n';
    const labelled = optionElement({ ariaLabel: ' Zee ', heading: 'Zee (aanbevolen)', text: cardText });
    assert.equal(optionName(labelled), 'Zee');
    const headed = optionElement({ heading: ' Zee\n (aanbevolen) ', text: cardText });
    assert.equal(optionName(headed), 'Zee (aanbevolen)');
    const blankLabel = optionElement({ ariaLabel: '  ', heading: 'Zee (aanbevolen)', text: cardText });
    assert.equal(optionName(blankLabel), 'Zee (aanbevolen)', 'an aria-label of spaces names nothing');
    const textOnly = optionName(optionElement({ text: cardText }));
    assert.equal(textOnly, 'Zee (aanbevolen) Bewaar je antwoord op d');
    assert.equal(textOnly.length, 40);
    assert.equal(optionName(optionElement({ text: ' Zand ' })), 'Zand');
  });

  it('serves nothing outside the folder and nothing that is not a sketch', async () => {
    const root = await fixture();
    const folder = path.join(root, 'sketches');
    await fs.mkdir(folder);
    await fs.writeFile(path.join(root, 'outside.html'), '<p>not a sketch</p>');
    await fs.writeFile(path.join(folder, 'notes.txt'), 'not a sketch');
    const tab = startTab(folder);
    try {
      const url = await tab.url;
      const key = url.searchParams.get('key');
      for (const name of ['..%2Foutside.html', 'notes.txt', '100%25.html', '%E0%A4%A']) {
        const refused = await fetch(`${url.origin}/k/${key}/sketch/${name}`);
        assert.equal(refused.status, 404, name);
      }
      const wrongKey = await fetch(`${url.origin}/k/0000000000000000/sketch/001-palette.html`);
      assert.equal(wrongKey.status, 403);
    } finally {
      tab.stop();
      await tab.exit;
    }
  });

  it('records only an answer its own page could send, for the sketch on screen', async () => {
    const folder = await fixture();
    const tab = startTab(folder);
    try {
      const url = await tab.url;
      const events = await openEvents(url);
      await events.next();
      await fs.writeFile(path.join(folder, '001-palette.html'), PALETTE);
      await events.next();
      events.close();

      const picked = { sketch: '001-palette.html', choice: 'zand', label: 'Zand', steer: '' };
      const asForm = await answer(url, picked, { 'content-type': 'text/plain' });
      assert.equal(asForm.status, 403, 'a sandboxed frame cannot send JSON without a preflight');
      const foreign = await answer(url, picked, { 'content-type': 'application/json', origin: 'http://evil.example' });
      assert.equal(foreign.status, 403);
      const unknownChoice = await answer(url, { ...picked, choice: 'goud' });
      assert.equal(unknownChoice.status, 400, 'an option the sketch does not hold is no answer');
      const otherSketch = await answer(url, { ...picked, sketch: '000-older.html' });
      assert.equal(otherSketch.status, 400, 'an answer names the sketch on screen');
      const empty = await answer(url, { sketch: '001-palette.html', choice: null, steer: '  ' });
      assert.equal(empty.status, 400);
      const oversized = await answer(url, { ...picked, steer: 'x'.repeat(20000) }).catch(() => ({ status: 400 }));
      assert.equal(oversized.status, 400);
      assert.equal(await fs.readFile(path.join(folder, 'answers.jsonl'), 'utf8').catch(() => ''), '');

      const accepted = await answer(url, { ...picked, steer: ' iets warmer ' });
      assert.equal(accepted.status, 200);
      const waited = await run(SKETCH_TAB, ['--wait', folder, '--sketch', '001-palette.html', '--timeout', '5']);
      assert.equal(waited.code, 0, waited.stderr);
      assert.deepEqual(JSON.parse(waited.stdout), {
        sketch: '001-palette.html', choice: 'zand', label: 'Zand', steer: 'iets warmer'
      });
    } finally {
      tab.stop();
      await tab.exit;
    }
  });

  const cannotLockAFile = process.platform === 'win32' || process.getuid?.() === 0;
  it('keeps serving past a sketch it cannot read, and takes an unquoted choice id', { skip: cannotLockAFile }, async () => {
    const folder = await fixture();
    const tab = startTab(folder);
    try {
      const url = await tab.url;
      const events = await openEvents(url);
      await events.next();

      const locked = path.join(folder, '001-locked.html');
      await fs.writeFile(locked, PALETTE);
      await fs.chmod(locked, 0o000);
      await new Promise((resolve) => { setTimeout(resolve, 700); });
      assert.match(tab.stderr(), /001-locked\.html cannot be read/);
      assert.equal((tab.stderr().match(/cannot be read/g) ?? []).length, 1, 'said once, not on every scan');
      await fs.stat(path.join(folder, 'tab.json'));

      const bare = '<title>Kaal</title><div data-choice=zee>Zee</div><div data-choice="a&amp;b">Entiteit</div>';
      await fs.writeFile(path.join(folder, '002-bare.html'), bare);
      const next = await events.next();
      assert.equal(next.sketch, '002-bare.html', 'the scan survived the unreadable file');
      events.close();
      assert.match(tab.stderr(), /002-bare\.html holds data-choice ids a click cannot match \(a&amp;b\)/);

      const accepted = await answer(url, { sketch: '002-bare.html', choice: 'zee', label: 'Zee', steer: '' });
      assert.equal(accepted.status, 200, 'an unquoted id is the id the page sends');
    } finally {
      tab.stop();
      await tab.exit;
    }
  });

  it('takes a note without a pick as a revision request', async () => {
    const folder = await fixture();
    const tab = startTab(folder);
    try {
      const url = await tab.url;
      const events = await openEvents(url);
      await events.next();
      await fs.writeFile(path.join(folder, '001-palette.html'), PALETTE);
      await events.next();
      events.close();

      const noted = await answer(url, { sketch: '001-palette.html', choice: null, steer: 'geen van beide, groener' });
      assert.equal(noted.status, 200);
      const waited = await run(SKETCH_TAB, ['--wait', folder, '--sketch', '001-palette.html', '--timeout', '5']);
      assert.deepEqual(JSON.parse(waited.stdout), {
        sketch: '001-palette.html', choice: null, label: '', steer: 'geen van beide, groener'
      });
    } finally {
      tab.stop();
      await tab.exit;
    }
  });

  it('carries the frame\'s current picks when a note is sent from the footer', () => {
    const tab = runTabScript();
    // The sketch frame reports its form's live state, the way the shim does
    // on every change, well before any send button is clicked.
    tab.messageHandlers[0]({ source: tab.frame.contentWindow, data: { sketchFieldsLive: { 'choice-format': 'csv' } } });
    tab.steer.value = 'nog even wachten';
    tab.send.handlers.click();
    assert.equal(tab.fetchCalls.length, 1);
    assert.equal(tab.fetchCalls[0].choice, null);
    assert.deepEqual(tab.fetchCalls[0].fields, { 'choice-format': 'csv' });
  });

  it('records the fields a form sends with its click, and refuses fields it cannot trust', async () => {
    const folder = await fixture();
    const tab = startTab(folder);
    try {
      const url = await tab.url;
      const events = await openEvents(url);
      await events.next();
      await fs.writeFile(path.join(folder, '001-round.html'), `<title>Round 1</title>
<form><input type="radio" name="choice-format" value="csv"><button type="button" data-choice="round">Send</button></form>`);
      await events.next();
      events.close();

      const sent = { sketch: '001-round.html', choice: 'round', label: 'Send', steer: '' };
      const listed = await answer(url, { ...sent, fields: ['choice-format'] });
      assert.equal(listed.status, 400, 'fields are an object of names');
      const unsafeName = await answer(url, { ...sent, fields: { 'choice format': 'csv' } });
      assert.equal(unsafeName.status, 400, 'a field name is letters, digits, hyphens and underscores');
      const notText = await answer(url, { ...sent, fields: { 'choice-format': 1 } });
      assert.equal(notText.status, 400, 'a field value is text');
      const crowded = Object.fromEntries(Array.from({ length: 65 }, (unused, index) => [`field-${index}`, 'x']));
      const tooMany = await answer(url, { ...sent, fields: crowded });
      assert.equal(tooMany.status, 400, 'a form holds at most 64 fields');

      const accepted = await answer(url, { ...sent, fields: { 'choice-format': 'csv', 'words-format': ' ' } });
      assert.equal(accepted.status, 200);
      const waited = await run(SKETCH_TAB, ['--wait', folder, '--sketch', '001-round.html', '--timeout', '5']);
      assert.equal(waited.code, 0, waited.stderr);
      assert.deepEqual(JSON.parse(waited.stdout), {
        sketch: '001-round.html', choice: 'round', label: 'Send', steer: '', fields: { 'choice-format': 'csv', 'words-format': ' ' }
      });
    } finally {
      tab.stop();
      await tab.exit;
    }
  });

  it('exits 3 from --wait when no answer arrives, and when no server runs at all', async () => {
    const served = await fixture();
    const tab = startTab(served);
    try {
      await tab.url;
      const silent = await run(SKETCH_TAB, ['--wait', served, '--sketch', '001-palette.html', '--timeout', '1']);
      assert.equal(silent.code, 3);
      assert.equal(silent.stdout, '');
      assert.match(silent.stderr, /no answer arrived within 1s; the recommended option stands/);
    } finally {
      tab.stop();
      await tab.exit;
    }

    const unserved = await fixture();
    const alone = await run(SKETCH_TAB, ['--wait', unserved, '--sketch', '001-palette.html', '--timeout', '30']);
    assert.equal(alone.code, 3);
    assert.match(alone.stderr, /no tab server runs for this folder/);
  });

  it('opens no second tab for a folder that is already served', async () => {
    const folder = await fixture();
    const tab = startTab(folder);
    try {
      const url = await tab.url;
      const second = await run(SKETCH_TAB, ['--serve', folder, '--no-open']);
      assert.equal(second.code, 0);
      assert.ok(second.stderr.includes(`already serving this folder at ${url.href}`), second.stderr);
    } finally {
      tab.stop();
      await tab.exit;
    }
  });

  it('leaves by itself once no tab has been connected for --idle seconds', async () => {
    const folder = await fixture();
    const tab = startTab(folder, ['--idle', '1']);
    await tab.url;
    const result = await tab.exit;
    assert.equal(result.code, 0, result.stderr);
    await assert.rejects(fs.stat(path.join(folder, 'tab.json')), 'the tab file goes with the server');
  });

  it('takes the tab copy from --labels and refuses a key the tab does not know', async () => {
    const folder = await fixture();
    const labels = await jsonFixture('tab-labels.json', { lang: 'nl', waiting: 'De eerste schets komt eraan.' });
    const tab = startTab(folder, ['--labels', labels]);
    try {
      const html = await (await fetch(await tab.url)).text();
      assert.match(html, /<html lang="nl">/);
      assert.match(html, /De eerste schets komt eraan\./);
      assert.match(html, /Want anything changed\?/, 'a key the file omits falls back');
    } finally {
      tab.stop();
      await tab.exit;
    }

    const pickerKey = await jsonFixture('picker-labels.json', { choose: 'Kies' });
    const refused = await run(SKETCH_TAB, ['--serve', folder, '--no-open', '--labels', pickerKey]);
    assert.equal(refused.code, 2);
    assert.match(refused.stderr, /unknown key 'choose'/);
  });
});

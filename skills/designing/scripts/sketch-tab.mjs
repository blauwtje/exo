// The sketch tab for the ui-design skill: one browser tab that stays open for
// the whole session and shows the newest sketch in a folder, so a visual
// question costs one file write and its revision costs one more. A sketch is a
// small HTML fragment whose options carry data-choice; one click answers.
//
//   node scripts/sketch-tab.mjs --serve <dir> [--labels <labels.json>]
//                               [--idle <seconds, default 1800>] [--no-open]
//   node scripts/sketch-tab.mjs --wait <dir> --sketch <file.html>
//                               [--timeout <seconds, default 600>]
//
// --serve runs once per session, in the background. It opens the tab at once,
// with a waiting line until the first sketch lands, and pushes every newer
// sketch into that same tab. A sketch that lands while no tab is connected
// opens the tab again, and a second --serve on a folder that is already served
// prints the running URL and opens nothing. It leaves when no tab has been
// connected for --idle seconds. Exit 3 means no browser can open here.
//
// --wait blocks until the tab records an answer for that one sketch and prints
// it on stdout as one line, {"sketch","choice","label","steer"}, plus "fields"
// when the click came from inside a form. choice is null
// when the chooser sent a note without picking. Exit 2 is a usage error; exit 3
// means no tab server runs for the folder or no answer arrived in time, and the
// recommended option is then the selection.
//
// A sketch opens with <title>, which is the question the tab asks above it.
// The rest is its own markup and its own <style>, served inside the picker's
// structural shell in a sandboxed frame. Every answer is appended to
// answers.jsonl in the folder, which is also the record of what was chosen.

import { randomBytes } from 'node:crypto';
import { realpathSync } from 'node:fs';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { CapabilityError, parseFlags, UsageError } from './capture.mjs';
import {
  askedOfLoopback, CHROME_TOKENS, compDocument, escapeHtml, headlessReason, openSystemBrowser,
  readLabels, requireTimeout, resolveAsset, send, sentByOwnPage
} from './pick.mjs';

const DEFAULT_IDLE_SECONDS = 1800;
const FOLDER_SCAN_MS = 300;
const ANSWER_POLL_MS = 250;
// --wait and --serve may start in the same message, so a missing server is
// only a finding once it has had this long to write its tab file.
const SERVER_START_GRACE_MS = 5000;
// A browser that is still starting has no tab connected yet, and a sketch
// landing in that gap must not open a second one.
const BROWSER_START_GRACE_MS = 8000;
// An answer is a choice id and one sentence of steer; anything larger is not
// an answer, and this server buffers no more than that.
const ANSWER_BYTES_MAX = 16384;
const STEER_CHARACTERS_MAX = 2000;
// A click inside a form sends the form's fields with it, so a page of several
// questions is one answer. Each field is one short answer; 64 of them is far
// more than one page asks.
const FIELDS_MAX = 64;

const SKETCH_NAME = /^[A-Za-z0-9][\w.-]*\.html$/;
const SKETCH_TITLE = /<title>([^<]*)<\/title>/i;
const SKETCH_CHOICE = /\bdata-choice\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
// The server reads an id from the file's text and the page sends the parsed
// attribute; the two agree only for an id no entity or escape can change.
const PLAIN_CHOICE = /^[\w-]+$/;
const TAB_FILE = 'tab.json';
const ANSWERS_FILE = 'answers.jsonl';

// The last resort for a key the --labels file leaves out; the skill writes the
// tab's copy in the conversation's own language on every run.
const DEFAULT_LABELS = {
  lang: 'en',
  waiting: 'The first sketch is on its way.',
  fallbackQuestion: 'Which one fits best?',
  hint: 'Click the one you like. This tab stays open for the next sketch.',
  steer: 'Want anything changed?',
  send: 'Send note',
  received: 'Got it. The next sketch appears here.',
  failed: 'Your answer did not arrive. Say it in the conversation instead.',
  lost: 'This tab lost its session. Say your answer in the conversation instead.'
};

/** The name the tab and the answer repeat for a clicked option: its aria-label,
 *  else its first heading, else the start of its text. The shim carries this
 *  function's source into the sketch frame, so it reads nothing outside its
 *  own body. */
export function optionName(choice) {
  const textStartCharacters = 40;
  const tidy = (text) => (text ?? '').trim().replace(/\s+/g, ' ');
  const heading = choice.querySelector('h1,h2,h3,h4,h5,h6');
  return tidy(choice.getAttribute('aria-label'))
    || tidy(heading?.textContent)
    || tidy(choice.textContent).slice(0, textStartCharacters);
}

// Injected into every served sketch. It turns each data-choice element into a
// control a keyboard reaches, hands a click to the tab, and marks the option
// only once the tab confirms the answer arrived, so a click that went nowhere
// never looks chosen. The ring is black on white because the sketch owns every
// colour behind it and one tone alone would vanish on some ground.
const SKETCH_SHIM = `<style>
[data-choice]{cursor:pointer}
[data-choice]:focus-visible,[data-choice][aria-pressed="true"]{outline:3px solid #000;outline-offset:2px;box-shadow:0 0 0 8px #fff}
</style>
<script>
(() => {
  const choices = [...document.querySelectorAll('[data-choice]')];
  for (const choice of choices) {
    if (!choice.matches('button')) {
      choice.setAttribute('role', 'button');
      choice.tabIndex = 0;
    }
    choice.setAttribute('aria-pressed', 'false');
  }
  ${optionName}
  let locked = false;
  const offer = (choice) => {
    if (locked) return;
    const name = optionName(choice);
    const form = choice.closest('form');
    const fields = form ? Object.fromEntries(new FormData(form)) : null;
    parent.postMessage({ sketchChoice: choice.dataset.choice, sketchLabel: name.slice(0, 120), sketchFields: fields }, '*');
  };
  addEventListener('click', (event) => {
    if (event.target.closest?.('a[href]')) event.preventDefault();
    const choice = event.target.closest?.('[data-choice]');
    if (choice) offer(choice);
  }, true);
  addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const choice = event.target.closest?.('[data-choice]');
    // A button turns both keys into a click by itself.
    if (!choice || choice.matches('button')) return;
    event.preventDefault();
    offer(choice);
  });
  addEventListener('submit', (event) => event.preventDefault(), true);
  window.open = () => null;
  addEventListener('message', (event) => {
    if (event.source !== parent || typeof event.data?.sketchChosen !== 'string') return;
    locked = true;
    for (const choice of choices) {
      choice.setAttribute('aria-pressed', String(choice.dataset.choice === event.data.sketchChosen));
    }
  });
})();
</script>`;

function requireIdle(text) {
  if (text === undefined) return DEFAULT_IDLE_SECONDS;
  const seconds = Number(text);
  if (!Number.isInteger(seconds) || seconds < 1) {
    throw new UsageError(`--idle must be a whole number of seconds from 1, received '${text}'`);
  }
  return seconds;
}

/** The sketch folder, created when absent: the server, the wait and the first
 *  sketch start in one message, in no fixed order. Canonical, because
 *  resolveAsset compares real paths. */
async function requireFolder(directory, flag) {
  if (!directory) throw new UsageError(`${flag} needs the sketch folder`);
  try {
    await fs.mkdir(directory, { recursive: true });
    return realpathSync(directory);
  } catch {
    throw new UsageError(`${flag} folder '${directory}' cannot be created or read`);
  }
}

/** The most recently written sketch in the folder, by name where two share a
 *  timestamp, or null while the folder holds none. */
async function newestSketch(directory) {
  const names = await fs.readdir(directory);
  let newest = null;
  for (const name of names.filter((each) => SKETCH_NAME.test(each))) {
    const stats = await fs.stat(path.join(directory, name)).catch(() => null);
    if (!stats?.isFile()) continue;
    const later = newest === null || stats.mtimeMs > newest.writtenAt
      || (stats.mtimeMs === newest.writtenAt && name > newest.name);
    if (later) newest = { name, writtenAt: stats.mtimeMs };
  }
  return newest;
}

/** One sketch as the tab needs it: the question from its <title>, the markup
 *  without that title, and the choice ids an answer may name. */
async function readSketch(directory, name) {
  const file = SKETCH_NAME.test(name) ? await resolveAsset({ directory }, name) : null;
  if (!file) return null;
  const written = await fs.readFile(file, 'utf8');
  const question = (SKETCH_TITLE.exec(written)?.[1] ?? '').trim();
  const choices = [...written.matchAll(SKETCH_CHOICE)].map((match) => match[1] ?? match[2] ?? match[3]);
  return { question, markup: written.replace(SKETCH_TITLE, ''), choices };
}

function tabPage(key, words) {
  const copy = JSON.stringify(words).replaceAll('<', '\\u003c');
  return `<!doctype html>
<html lang="${escapeHtml(words.lang)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(words.waiting)}</title>
<style>
  :root {
${CHROME_TOKENS}
  }
  * { box-sizing: border-box; }
  html, body { block-size: 100%; }
  body {
    margin: 0; display: grid; grid-template-rows: auto 1fr auto;
    color: var(--ink); background: var(--ground); font: 14px/1.5 var(--font-stack);
  }
  header { grid-row: 1; }
  iframe { grid-row: 2; }
  footer { grid-row: 3; }
  header, footer { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 16px; padding: 10px 16px; }
  h1 { font-size: 16px; font-weight: 650; letter-spacing: -0.01em; margin: 0; }
  #status { margin: 0; color: var(--ink-muted); font-size: 13px; }
  /* White, because a sketch that sets no ground of its own was written against
     a browser's default page and not against this chrome. */
  iframe { inline-size: 100%; block-size: 100%; border: 0; border-block: 1px solid var(--border); background: #fff; }
  label { color: var(--ink-muted); font-size: 13px; }
  input {
    flex: 1 1 240px; min-inline-size: 0; min-block-size: 32px; padding-inline: 10px;
    font: inherit; color: var(--ink); background: var(--surface);
    border: 1px solid var(--border-control); border-radius: var(--radius-control); caret-color: var(--accent);
  }
  button {
    min-block-size: 32px; padding-inline: 12px; font: inherit; font-weight: 550; cursor: pointer;
    color: var(--accent-ink); background: var(--accent);
    border: 1px solid transparent; border-radius: var(--radius-control);
  }
  button:disabled { opacity: 0.5; cursor: default; }
  :focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  @media (pointer: coarse) { input, button { min-block-size: 44px; } }
</style></head>
<body>
<header><h1 id="question">${escapeHtml(words.waiting)}</h1><p id="status" role="status"></p></header>
<iframe id="sketch" sandbox="allow-scripts" title="${escapeHtml(words.fallbackQuestion)}" hidden></iframe>
<footer><label for="steer">${escapeHtml(words.steer)}</label><input id="steer" type="text" maxlength="${STEER_CHARACTERS_MAX}" autocomplete="off"><button id="send" type="button" disabled>${escapeHtml(words.send)}</button></footer>
<script>
  const key = ${JSON.stringify(key)};
  const words = ${copy};
  const frame = document.getElementById('sketch');
  const question = document.getElementById('question');
  const status = document.getElementById('status');
  const steer = document.getElementById('steer');
  const sendNote = document.getElementById('send');
  let shown = null;
  let answered = false;

  const updates = new EventSource('/events?key=' + encodeURIComponent(key));
  updates.onmessage = (event) => {
    const next = JSON.parse(event.data);
    if (!next.sketch || next.version === shown?.version) return;
    shown = next;
    answered = false;
    const asked = next.question || words.fallbackQuestion;
    question.textContent = asked;
    frame.title = asked;
    // A sketch that lands while this tab is in the background marks the tab
    // strip, which is the only place a hidden tab can say anything.
    document.title = (document.hidden ? '● ' : '') + asked;
    status.textContent = words.hint;
    steer.value = '';
    sendNote.disabled = false;
    frame.hidden = false;
    frame.src = '/k/' + key + '/sketch/' + encodeURIComponent(next.sketch) + '?v=' + encodeURIComponent(next.version);
  };
  updates.onerror = () => { status.textContent = words.lost; };
  updates.onopen = () => {
    if (status.textContent === words.lost) status.textContent = shown && !answered ? words.hint : '';
  };
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && shown) document.title = shown.question || words.fallbackQuestion;
  });

  async function deliver(choice, label, fields) {
    if (!shown || answered) return;
    let delivered = false;
    try {
      delivered = (await fetch('/answer?key=' + encodeURIComponent(key), {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sketch: shown.sketch, choice, label, steer: steer.value, fields })
      })).ok;
    } catch { delivered = false; }
    if (!delivered) {
      status.textContent = words.failed;
      return;
    }
    answered = true;
    sendNote.disabled = true;
    if (choice !== null) frame.contentWindow.postMessage({ sketchChosen: choice }, '*');
    status.textContent = (label ? label + '. ' : '') + words.received;
  }

  addEventListener('message', (event) => {
    if (event.source !== frame.contentWindow || typeof event.data?.sketchChoice !== 'string') return;
    deliver(event.data.sketchChoice, String(event.data.sketchLabel ?? ''), event.data.sketchFields ?? null);
  });
  sendNote.addEventListener('click', () => { if (steer.value.trim() !== '') deliver(null, '', null); });
  steer.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.isComposing && steer.value.trim() !== '') deliver(null, '', null);
  });
</script></body></html>`;
}

/** The fields a form sent with its click: null when none were sent, undefined
 *  when they are not an object of plain names holding text, which refuses the
 *  whole answer. Values are cut like the steer. */
function readFields(fields) {
  if (fields === undefined || fields === null) return null;
  if (typeof fields !== 'object' || Array.isArray(fields)) return undefined;
  const entries = Object.entries(fields);
  if (entries.length > FIELDS_MAX) return undefined;
  const read = {};
  for (const [name, value] of entries) {
    if (!PLAIN_CHOICE.test(name) || typeof value !== 'string') return undefined;
    read[name] = value.slice(0, STEER_CHARACTERS_MAX);
  }
  return read;
}

/** The answer a POST body carries, or null when it names another sketch, an
 *  option the sketch on screen does not hold, fields it cannot trust, or
 *  nothing at all. */
function readAnswer(body, current) {
  let parsed = null;
  try { parsed = JSON.parse(body); } catch { return null; }
  if (parsed === null || typeof parsed !== 'object' || !current || parsed.sketch !== current.name) return null;
  const choice = parsed.choice ?? null;
  if (choice !== null && !current.choices.includes(choice)) return null;
  const steer = typeof parsed.steer === 'string' ? parsed.steer.trim().slice(0, STEER_CHARACTERS_MAX) : '';
  if (choice === null && steer === '') return null;
  const fields = readFields(parsed.fields);
  if (fields === undefined) return null;
  const label = typeof parsed.label === 'string' ? parsed.label.slice(0, 120) : '';
  const answer = { sketch: current.name, choice, label, steer, at: new Date().toISOString() };
  if (fields !== null) answer.fields = fields;
  return answer;
}

function collectBody(request) {
  return new Promise((resolve) => {
    let body = '';
    request.on('data', (chunk) => {
      body += chunk;
      if (body.length > ANSWER_BYTES_MAX) {
        resolve(null);
        request.destroy();
      }
    });
    request.on('end', () => resolve(body));
    request.on('error', () => resolve(null));
  });
}

function reportUnmatchableChoices(name, choices) {
  const unmatchable = choices.filter((choice) => !PLAIN_CHOICE.test(choice));
  if (unmatchable.length === 0) return;
  process.stderr.write(`sketch tab: ${name} holds data-choice ids a click cannot match (${unmatchable.join(', ')}); use letters, digits and hyphens\n`);
}

const stateEvent = (tab) => `data: ${JSON.stringify({
  sketch: tab.current?.name ?? null, version: tab.current?.version ?? null, question: tab.current?.question ?? ''
})}\n\n`;

function openTab(tab) {
  tab.browserOpenedAt = Date.now();
  if (tab.wantsBrowser) openSystemBrowser(tab.url);
}

async function sendSketch(tab, encodedName, response) {
  let name;
  try {
    name = decodeURIComponent(encodedName);
  } catch {
    return send(response, 404, null, '');
  }
  const sketch = await readSketch(tab.directory, name);
  if (!sketch) return send(response, 404, null, '');
  if (tab.current?.name === name) {
    const seconds = ((Date.now() - tab.current.writtenAt) / 1000).toFixed(1);
    process.stderr.write(`sketch tab: shown ${name} ${seconds}s after it was written\n`);
  }
  return send(response, 200, 'text/html; charset=utf-8', compDocument(sketch.markup, tab.words.lang, SKETCH_SHIM));
}

function openStream(tab, request, response) {
  response.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store' });
  response.write(stateEvent(tab));
  tab.streams.add(response);
  request.on('close', () => {
    tab.streams.delete(response);
    tab.lastConnectedAt = Date.now();
  });
}

async function recordAnswer(tab, request, response) {
  const body = await collectBody(request);
  const answer = body === null ? null : readAnswer(body, tab.current);
  if (!answer) return send(response, 400, 'application/json', '{"ok":false}');
  await fs.appendFile(path.join(tab.directory, ANSWERS_FILE), `${JSON.stringify(answer)}\n`);
  return send(response, 200, 'application/json', '{"ok":true}');
}

async function handleRequest(tab, request, response) {
  const url = new URL(request.url, `http://127.0.0.1:${tab.port}`);
  if (!askedOfLoopback(request, tab.port)) return send(response, 403, null, '');

  // A sketch carries the key in its path, as the picker's comps do, so the
  // frame's own URL needs no query the tab page would have to rebuild.
  const asked = tab.sketchPath.exec(url.pathname);
  if (request.method === 'GET' && asked) return sendSketch(tab, asked[1], response);

  if (url.searchParams.get('key') !== tab.key) return send(response, 403, null, '');
  if (request.method === 'GET' && url.pathname === '/') {
    return send(response, 200, 'text/html; charset=utf-8', tabPage(tab.key, tab.words));
  }
  if (request.method === 'GET' && url.pathname === '/events') return openStream(tab, request, response);
  if (request.method !== 'POST' || url.pathname !== '/answer') return send(response, 404, null, '');
  if (!sentByOwnPage(request, tab.port)) return send(response, 403, null, '');
  return recordAnswer(tab, request, response);
}

/** Push a newer sketch to every connected tab, and open the tab again when
 *  the chooser closed it since the last one. */
async function showNewestSketch(tab) {
  const newest = await newestSketch(tab.directory).catch(() => null);
  if (!newest) return;
  const version = `${newest.name}:${newest.writtenAt}`;
  if (version === tab.current?.version || version === tab.unreadableVersion) return;
  const sketch = await readSketch(tab.directory, newest.name).catch(() => null);
  if (!sketch) {
    tab.unreadableVersion = version;
    process.stderr.write(`sketch tab: ${newest.name} cannot be read, so the tab keeps the sketch it shows\n`);
    return;
  }
  reportUnmatchableChoices(newest.name, sketch.choices);
  tab.current = { ...newest, version, question: sketch.question, choices: sketch.choices };
  for (const stream of tab.streams) stream.write(stateEvent(tab));
  const browserMayStillStart = Date.now() - tab.browserOpenedAt < BROWSER_START_GRACE_MS;
  if (tab.streams.size === 0 && !browserMayStillStart) openTab(tab);
}

function idleTooLong(tab, idleSeconds) {
  if (tab.streams.size > 0) return false;
  const lastSign = Math.max(tab.lastConnectedAt, tab.browserOpenedAt, tab.current?.writtenAt ?? 0);
  return Date.now() - lastSign > idleSeconds * 1000;
}

/** Serve the tab on a random localhost port behind a per-run key, and return
 *  once no tab has been connected for the idle window or a signal arrives. */
async function serveTab(directory, words, { idleSeconds, wantsBrowser }) {
  const key = randomBytes(8).toString('hex');
  const tab = {
    directory, words, wantsBrowser, key, port: 0, url: '',
    sketchPath: new RegExp(`^/k/${key}/sketch/([^/]+)$`),
    streams: new Set(), current: null, unreadableVersion: null, browserOpenedAt: 0, lastConnectedAt: Date.now()
  };
  const server = http.createServer((request, response) => {
    handleRequest(tab, request, response).catch(() => send(response, 500, null, ''));
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  tab.port = server.address().port;
  tab.url = `http://127.0.0.1:${tab.port}/?key=${key}`;
  const tabFile = path.join(directory, TAB_FILE);
  await fs.writeFile(tabFile, `${JSON.stringify({ url: tab.url, pid: process.pid })}\n`);
  process.stderr.write(`sketch tab: URL ${tab.url}\n`);
  openTab(tab);

  let leaving = false;
  const leave = () => { leaving = true; };
  process.once('SIGTERM', leave);
  process.once('SIGINT', leave);
  try {
    while (!leaving && !idleTooLong(tab, idleSeconds)) {
      await showNewestSketch(tab);
      await new Promise((resolve) => { setTimeout(resolve, FOLDER_SCAN_MS); });
    }
  } finally {
    // A tab file that outlives its scan makes every --wait trust a dead tab.
    for (const stream of tab.streams) stream.end();
    server.close();
    server.closeAllConnections();
    await fs.rm(tabFile, { force: true });
  }
}

/** The tab server recorded for this folder, when its process still runs. */
async function runningTab(directory) {
  const text = await fs.readFile(path.join(directory, TAB_FILE), 'utf8').catch(() => null);
  if (text === null) return null;
  let recorded = null;
  try { recorded = JSON.parse(text); } catch { return null; }
  if (!Number.isInteger(recorded?.pid) || typeof recorded.url !== 'string') return null;
  try {
    process.kill(recorded.pid, 0);
  } catch (error) {
    // EPERM means the process exists under another user, which is still alive.
    if (error.code !== 'EPERM') return null;
  }
  return recorded;
}

async function recordedAnswer(directory, sketchName) {
  const text = await fs.readFile(path.join(directory, ANSWERS_FILE), 'utf8').catch(() => '');
  for (const line of text.split('\n')) {
    if (line === '') continue;
    let answer = null;
    try { answer = JSON.parse(line); } catch { continue; }
    if (answer?.sketch === sketchName) return answer;
  }
  return null;
}

/** Block until the tab records an answer for this sketch. A revision is a new
 *  file name, never a rewrite of an answered one: answers are matched by name,
 *  so a rewritten sketch would be answered by the click its first version got. */
async function waitForAnswer(directory, sketchName, timeoutSeconds) {
  const startedAt = Date.now();
  const deadline = startedAt + timeoutSeconds * 1000;
  for (;;) {
    const answer = await recordedAnswer(directory, sketchName);
    if (answer) return answer;
    const serverHadTime = Date.now() - startedAt > SERVER_START_GRACE_MS;
    if (serverHadTime && !(await runningTab(directory))) {
      throw new CapabilityError('sketch tab: no tab server runs for this folder; the recommended option stands');
    }
    if (Date.now() >= deadline) {
      throw new CapabilityError(`sketch tab: no answer arrived within ${timeoutSeconds}s; the recommended option stands`);
    }
    await new Promise((resolve) => { setTimeout(resolve, ANSWER_POLL_MS); });
  }
}

async function main(argv) {
  const flags = parseFlags(argv, {
    serve: 'value', wait: 'value', sketch: 'value', labels: 'value',
    idle: 'value', timeout: 'value', 'no-open': 'boolean'
  });
  if ((flags.serve === undefined) === (flags.wait === undefined)) {
    throw new UsageError('give exactly one of --serve <dir> and --wait <dir>');
  }

  if (flags.wait !== undefined) {
    const directory = await requireFolder(flags.wait, '--wait');
    if (!flags.sketch || !SKETCH_NAME.test(flags.sketch)) {
      throw new UsageError('--wait needs --sketch <file.html>, the sketch whose answer it waits for');
    }
    const answer = await waitForAnswer(directory, flags.sketch, requireTimeout(flags.timeout));
    const { sketch, choice, label, steer, fields } = answer;
    const printed = fields === undefined ? { sketch, choice, label, steer } : { sketch, choice, label, steer, fields };
    process.stdout.write(`${JSON.stringify(printed)}\n`);
    return;
  }

  const directory = await requireFolder(flags.serve, '--serve');
  const words = await readLabels(flags.labels, DEFAULT_LABELS);
  const idleSeconds = requireIdle(flags.idle);
  const wantsBrowser = !flags['no-open'];
  const headless = wantsBrowser ? headlessReason() : null;
  if (headless) {
    throw new CapabilityError(`sketch tab: no browser can open here (${headless}); the recommended option stands`);
  }
  const running = await runningTab(directory);
  if (running) {
    process.stderr.write(`sketch tab: already serving this folder at ${running.url}\n`);
    return;
  }
  await serveTab(directory, words, { idleSeconds, wantsBrowser });
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  main(process.argv.slice(2)).catch((error) => {
    if (error instanceof UsageError) {
      process.stderr.write(`sketch tab: ${error.message}\n`);
      process.exitCode = 2;
      return;
    }
    if (error instanceof CapabilityError) {
      process.stderr.write(`${error.message}\n`);
      process.exitCode = 3;
      return;
    }
    process.stderr.write(`sketch tab: ${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  });
}

// The question page for the shaping skill: one interview question, drawn from
// the decision map, shown in the browser tab the designing skill already
// serves. The map is the JSON file the session rewrites after every answer;
// this script draws the decision it names as asked, beside every other
// decision and its state, and hands back the click.
//
//   node scripts/question-page.mjs --serve <dir> --map <map.json> [--no-open]
//   node scripts/question-page.mjs --ask <dir> --map <map.json>
//                                  [--timeout <seconds, default 600>]
//
// --serve runs once per interview, in the background: it writes the tab's
// words from the map and starts the sketch tab on the folder. --ask draws the
// page, waits for the answer and prints one line on stdout,
// {"decision","choice","label","words","go"}. choice is null when the user
// wrote an answer of their own, which words then holds. A map whose asked is
// null draws the closing review, and its one choice is "done".
// Exit 2 is a usage error and names the field to fix. Exit 3 means no browser
// can open here or no answer arrived: the question is then asked in the
// conversation, never answered for the user.

import { spawn } from 'node:child_process';
import { realpathSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { CHROME_TOKENS, escapeHtml } from '#page-chrome';
import { parseFlags, UsageError } from '#script-flags';

const SKETCH_TAB = fileURLToPath(new URL('../../designing/scripts/sketch-tab.mjs', import.meta.url));
const LABELS_FILE = 'labels.json';
const STATES = ['open', 'waits', 'closed'];
const CLOSERS = ['you', 'code', 'exo'];
// The sketch tab matches a click to an id made of these characters only.
const PLAIN_ID = /^[A-Za-z0-9][\w-]*$/;
// Four answers and Go fill one screen; a fifth answer is a decision that was
// not split far enough to ask.
const OPTIONS_MAX = 4;
const GO = 'go';
const DONE = 'done';
// The words the sketch tab prints itself; its --labels file refuses any other key.
const TAB_WORDS = ['waiting', 'fallbackQuestion', 'hint', 'steer', 'send', 'received', 'failed', 'lost'];

const DEFAULT_WORDS = {
  waiting: 'The first question is on its way.',
  fallbackQuestion: 'Which answer fits?',
  hint: 'Click the answer that fits. This tab stays open for the next question.',
  steer: 'None of these? Write your own answer.',
  send: 'Send my answer',
  received: 'Got it. The next question appears here.',
  failed: 'Your answer did not arrive. Say it in the conversation instead.',
  lost: 'This tab lost its session. Say your answer in the conversation instead.',
  mapTitle: 'All decisions',
  place: 'Question {n}, {k} still open',
  now: 'This question',
  open: 'Still open',
  waits: 'Waits on',
  you: 'You chose',
  code: 'The code settles it',
  exo: 'exo chose',
  changes: 'What this changes',
  recommended: 'Recommended',
  go: 'Go',
  goGives: 'exo picks the recommended answer for everything still open.',
  reviewQuestion: 'Is this right?',
  done: 'Yes, write it down',
  doneGives: 'exo writes the brief from these decisions.'
};

function requireText(value, field) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new UsageError(`--map: ${field} must be a non-empty string`);
  }
  return value.trim();
}

function requireId(value, field) {
  const id = requireText(value, field);
  if (!PLAIN_ID.test(id) || id === GO || id === DONE) {
    throw new UsageError(`--map: ${field} '${id}' must be letters, digits, hyphens or underscores, and not '${GO}' or '${DONE}'`);
  }
  return id;
}

function checkedOption(option, field) {
  if (option === null || typeof option !== 'object') throw new UsageError(`--map: ${field} must be an object`);
  return {
    id: requireId(option.id, `${field}.id`),
    label: requireText(option.label, `${field}.label`),
    gives: requireText(option.gives, `${field}.gives`),
    recommended: option.recommended === true
  };
}

function checkedDecision(decision, index, asked) {
  const field = `decisions[${index}]`;
  if (decision === null || typeof decision !== 'object') throw new UsageError(`--map: ${field} must be an object`);
  const id = requireId(decision.id, `${field}.id`);
  if (!STATES.includes(decision.state)) {
    throw new UsageError(`--map: ${field}.state must be one of ${STATES.join(', ')}`);
  }
  const checked = { id, name: requireText(decision.name, `${field}.name`), state: decision.state };
  if (decision.state === 'waits') checked.waitsOn = requireId(decision.waitsOn, `${field}.waitsOn`);
  if (decision.state === 'closed') {
    checked.answer = requireText(decision.answer, `${field}.answer`);
    if (!CLOSERS.includes(decision.closedBy)) {
      throw new UsageError(`--map: ${field}.closedBy must be one of ${CLOSERS.join(', ')}`);
    }
    checked.closedBy = decision.closedBy;
    checked.evidence = typeof decision.evidence === 'string' ? decision.evidence.trim() : '';
  }
  if (id !== asked) return checked;
  if (decision.state !== 'open') throw new UsageError(`--map: asked names '${id}', whose state is not open`);
  checked.question = requireText(decision.question, `${field}.question`);
  checked.changes = requireText(decision.changes, `${field}.changes`);
  const options = Array.isArray(decision.options) ? decision.options : [];
  if (options.length < 2 || options.length > OPTIONS_MAX) {
    throw new UsageError(`--map: ${field}.options must hold 2 to ${OPTIONS_MAX} answers, received ${options.length}`);
  }
  checked.options = options.map((option, place) => checkedOption(option, `${field}.options[${place}]`));
  return checked;
}

/** The map as the page needs it, or a UsageError naming the first field that
 *  is wrong, so the session repairs the file instead of guessing. */
export function checkedMap(map) {
  if (map === null || typeof map !== 'object') throw new UsageError('--map must hold a JSON object');
  const asked = map.asked === null || map.asked === undefined ? null : requireId(map.asked, 'asked');
  if (!Array.isArray(map.decisions) || map.decisions.length === 0) {
    throw new UsageError('--map: decisions must be a non-empty array');
  }
  const decisions = map.decisions.map((decision, index) => checkedDecision(decision, index, asked));
  const ids = decisions.map((decision) => decision.id);
  const repeated = ids.find((id, index) => ids.indexOf(id) !== index);
  if (repeated) throw new UsageError(`--map: decision id '${repeated}' appears twice`);
  if (asked !== null && !ids.includes(asked)) throw new UsageError(`--map: asked names '${asked}', which is no decision`);
  for (const decision of decisions) {
    if (decision.state === 'waits' && !ids.includes(decision.waitsOn)) {
      throw new UsageError(`--map: '${decision.id}' waits on '${decision.waitsOn}', which is no decision`);
    }
  }
  if (asked === null && decisions.some((decision) => decision.state !== 'closed')) {
    throw new UsageError('--map: asked is null, which draws the closing review, while a decision is still open');
  }
  const words = { ...DEFAULT_WORDS };
  for (const [key, value] of Object.entries(map.words ?? {})) {
    if (Object.hasOwn(DEFAULT_WORDS, key) && typeof value === 'string' && value.trim() !== '') words[key] = value.trim();
  }
  return {
    lang: typeof map.lang === 'string' && map.lang.trim() !== '' ? map.lang.trim() : 'en',
    goal: requireText(map.goal, 'goal'),
    asked,
    decisions,
    words
  };
}

function stateLine(decision, map) {
  const { words } = map;
  if (decision.id === map.asked) return words.now;
  if (decision.state === 'open') return words.open;
  if (decision.state === 'waits') {
    const waitedOn = map.decisions.find((other) => other.id === decision.waitsOn);
    return `${words.waits}: ${waitedOn.name}`;
  }
  const source = decision.closedBy === 'code' && decision.evidence
    ? `${words.code} (${decision.evidence})`
    : words[decision.closedBy];
  return `${source}: ${decision.answer}`;
}

function mapList(map) {
  const items = map.decisions.map((decision) => {
    const current = decision.id === map.asked ? ' aria-current="step"' : '';
    return `<li class="decision decision-${decision.state}"${current}><span class="decision-name">${escapeHtml(decision.name)}</span><span class="decision-state">${escapeHtml(stateLine(decision, map))}</span></li>`;
  });
  return `<nav class="map" aria-label="${escapeHtml(map.words.mapTitle)}"><h2>${escapeHtml(map.words.mapTitle)}</h2><ol>${items.join('')}</ol></nav>`;
}

function answerButton(id, label, gives, mark) {
  const badge = mark ? ` <span class="badge">${escapeHtml(mark)}</span>` : '';
  return `<button type="button" class="answer" data-choice="${escapeHtml(id)}" aria-label="${escapeHtml(label)}"><span class="answer-label">${escapeHtml(label)}${badge}</span><span class="answer-gives">${escapeHtml(gives)}</span></button>`;
}

function questionPanel(map) {
  const { words } = map;
  if (map.asked === null) {
    return `<section class="panel"><p class="goal">${escapeHtml(map.goal)}</p><div class="answers">${answerButton(DONE, words.done, words.doneGives, '')}</div></section>`;
  }
  const asked = map.decisions.find((decision) => decision.id === map.asked);
  const stillOpen = map.decisions.filter((decision) => decision.state !== 'closed').length;
  const questionNumber = map.decisions.filter((decision) => decision.closedBy === 'you').length + 1;
  const place = words.place.replace('{n}', String(questionNumber)).replace('{k}', String(stillOpen));
  const recommendedFirst = [...asked.options].sort((left, right) => Number(right.recommended) - Number(left.recommended));
  const answers = recommendedFirst.map((option) => answerButton(option.id, option.label, option.gives, option.recommended ? words.recommended : ''));
  answers.push(answerButton(GO, words.go, words.goGives, ''));
  return `<section class="panel"><p class="place">${escapeHtml(place)}</p><p class="goal">${escapeHtml(map.goal)}</p><h2 class="changes-title">${escapeHtml(words.changes)}</h2><p class="changes">${escapeHtml(asked.changes)}</p><div class="answers">${answers.join('')}</div></section>`;
}

const PAGE_STYLE = `<style>
  :root {
${CHROME_TOKENS}
  }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 24px; color: var(--ink); background: var(--ground); font: 17px/1.5 var(--font-stack); }
  .page { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); gap: 32px; max-inline-size: 1100px; margin-inline: auto; }
  .panel { order: 1; }
  .map { order: 2; }
  h2 { font-size: 14px; font-weight: 650; margin: 0 0 8px; color: var(--ink-muted); }
  .place { margin: 0 0 4px; font-weight: 650; }
  .goal { margin: 0 0 20px; color: var(--ink-muted); max-inline-size: 60ch; }
  .changes { margin: 0 0 20px; max-inline-size: 60ch; }
  .answers { display: grid; gap: 12px; }
  .answer {
    display: grid; gap: 2px; inline-size: 100%; min-block-size: 56px; padding: 12px 16px; text-align: start;
    color: var(--ink); background: var(--surface); border: 1px solid var(--border-control); border-radius: var(--radius-control);
  }
  .answer:hover { border-color: var(--accent); }
  .answer-label { font-weight: 650; }
  .answer-gives { color: var(--ink-muted); }
  .badge { margin-inline-start: 8px; padding: 1px 8px; font-size: 13px; font-weight: 550; color: var(--accent-ink); background: var(--accent); border-radius: 999px; }
  .map ol { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
  .decision { display: grid; gap: 2px; padding: 8px 12px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-control); font-size: 15px; }
  .decision[aria-current] { border-color: var(--accent); border-inline-start-width: 4px; }
  .decision-name { font-weight: 650; }
  /* A file path in the evidence is one unbreakable word, and it sets the whole
     column's minimum width; anywhere keeps the page inside 320px. */
  .decision-state { color: var(--ink-muted); overflow-wrap: anywhere; }
  @media (max-width: 700px) { body { padding: 16px; } .page { grid-template-columns: minmax(0, 1fr); } }
</style>`;

/** One question as a sketch the tab serves: the question in <title>, which the
 *  tab prints above the page, then the panel and the map. Every text from the
 *  map is escaped, because an answer typed by the user comes back through it. */
export function renderQuestion(checked) {
  const asked = checked.decisions.find((decision) => decision.id === checked.asked);
  const title = asked ? asked.question : checked.words.reviewQuestion;
  return `<title>${escapeHtml(title)}</title>
${PAGE_STYLE}
<main class="page">${questionPanel(checked)}${mapList(checked)}</main>
`;
}

async function readMap(file) {
  if (!file) throw new UsageError('--map <map.json> is required');
  let written;
  try {
    written = await fs.readFile(file, 'utf8');
  } catch {
    throw new UsageError(`--map file '${file}' cannot be read`);
  }
  try {
    return checkedMap(JSON.parse(written));
  } catch (error) {
    if (error instanceof UsageError) throw error;
    throw new UsageError(`--map file '${file}' is not valid JSON: ${error.message}`);
  }
}

async function requireFolder(directory, flag) {
  if (!directory) throw new UsageError(`${flag} needs the question folder`);
  await fs.mkdir(directory, { recursive: true });
  return realpathSync(directory);
}

/** Run the sketch tab with these arguments. Its stderr passes through, its
 *  stdout is returned, and its exit code becomes this script's own. A signal
 *  that stops this script stops the tab too, because a tab server left behind
 *  keeps its port and its folder for half an hour. */
function runSketchTab(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [SKETCH_TAB, ...args], { stdio: ['ignore', 'pipe', 'inherit'] });
    const forward = (signal) => child.kill(signal);
    process.once('SIGTERM', forward);
    process.once('SIGINT', forward);
    let stdout = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code: code ?? 1, stdout }));
  });
}

async function serve(flags) {
  const directory = await requireFolder(flags.serve, '--serve');
  const map = await readMap(flags.map);
  const labelsFile = path.join(directory, LABELS_FILE);
  const labels = { lang: map.lang };
  for (const key of TAB_WORDS) labels[key] = map.words[key];
  await fs.writeFile(labelsFile, `${JSON.stringify(labels, null, 2)}\n`);
  const args = ['--serve', directory, '--labels', labelsFile];
  if (flags['no-open']) args.push('--no-open');
  const { code } = await runSketchTab(args);
  process.exitCode = code;
}

async function ask(flags) {
  const directory = await requireFolder(flags.ask, '--ask');
  const map = await readMap(flags.map);
  const written = (await fs.readdir(directory)).filter((name) => name.endsWith('.html')).length;
  const sketch = `${String(written + 1).padStart(3, '0')}-${map.asked ?? 'review'}.html`;
  await fs.writeFile(path.join(directory, sketch), renderQuestion(map));
  const args = ['--wait', directory, '--sketch', sketch];
  if (flags.timeout !== undefined) args.push('--timeout', flags.timeout);
  const { code, stdout } = await runSketchTab(args);
  if (code !== 0) {
    process.exitCode = code;
    return;
  }
  const answer = JSON.parse(stdout);
  const chosen = answer.choice === GO || answer.choice === DONE ? null : answer.choice;
  process.stdout.write(`${JSON.stringify({
    decision: map.asked, choice: chosen, label: chosen === null ? '' : answer.label, words: answer.steer, go: answer.choice === GO
  })}\n`);
}

async function main(argv) {
  const flags = parseFlags(argv, { serve: 'value', ask: 'value', map: 'value', timeout: 'value', 'no-open': 'boolean' });
  if ((flags.serve === undefined) === (flags.ask === undefined)) {
    throw new UsageError('give exactly one of --serve <dir> and --ask <dir>');
  }
  if (flags.serve !== undefined) return serve(flags);
  return ask(flags);
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  main(process.argv.slice(2)).catch((error) => {
    if (error instanceof UsageError) {
      process.stderr.write(`question page: ${error.message}\n`);
      process.exitCode = 2;
      return;
    }
    process.stderr.write(`question page: ${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  });
}

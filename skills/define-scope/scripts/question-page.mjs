// The question page for the define-scope skill: one interview round, drawn from the
// decision map, shown in the browser tab the design-ui skill already serves.
// The map is the JSON file the session rewrites after every round; this script
// draws each question of the round as a card, the earlier rounds with what was
// chosen, and the tree of every decision beside them, and hands back the whole
// round as one answer.
//
//   node scripts/question-page.mjs --serve <dir> --map <map.json> [--no-open]
//   node scripts/question-page.mjs --ask <dir> --map <map.json>
//                                  [--timeout <seconds, default 600>]
//   node scripts/question-page.mjs --map <map.json>
//                                  [--add <decisions.json>] [--apply <answer.json>] [--text]
//
// --serve runs once per interview, in the background: it writes the tab's
// words from the map and starts the sketch tab on the folder. --ask draws the
// page, waits for the answer and prints one line on stdout,
// {"round","answers","reopen","go","done","words"}, with one
// {"decision","choice","label","words"} per question of the round. choice is
// null when the user wrote an answer of their own or left the question open.
// A map with no open decision draws the checkpoint, whose done confirms it.
//
// --add and --apply own every transition: the map file is never written by
// hand. --add folds a {goal?,lang?,words?,decisions:[...]} file onto the map
// (creating it, round 1, when none exists yet); --apply folds one round's
// answer onto it. Either may appear alone or together in one call, --apply
// running first; both end by moving the map to what the next round asks and
// printing one line per change, then `round=<r> asked=<ids>`,
// `round=<r> checkpoint`, or `round=<r> draft`. --text then prints the
// chat layout for whatever the map now asks, or alone just reads and prints
// it. Exit 2 is a usage error and names the field to fix. Exit 3 (--ask only)
// means no browser can open here or no answer arrived: the round is then
// asked in the conversation, never answered for the user.

import { spawn } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { CHROME_TOKENS, escapeHtml } from '#page-chrome';
import { parseFlags, UsageError } from '#script-flags';
import { addDecisions, applyAnswer, nextRound } from './map-transition.mjs';
import { TEXT_WORDS, renderText } from './round-text.mjs';

const SKETCH_TAB = fileURLToPath(new URL('../../design-ui/scripts/sketch-tab.mjs', import.meta.url));
const LABELS_FILE = 'labels.json';
export const STATES = ['open', 'waits', 'closed'];
export const CLOSERS = ['you', 'code', 'exo'];
// Every id becomes part of a form field name, and the sketch tab accepts a
// field name made of these characters only.
const PLAIN_ID = /^[A-Za-z0-9][\w-]*$/;
// Four answers fill one card; a fifth answer is a decision that was not split
// far enough to ask.
export const OPTIONS_MAX = 4;
// A round asks at most four ready decisions (SKILL.md, "Ask in rounds"); a
// fifth waits for the next round instead.
export const ROUND_MAX = 4;
// A typed answer is a sentence or two; the tab itself cuts a field at 2,000.
const OWN_ANSWER_MAX = 500;
// The buttons that send the page, each with the whole form.
const SEND = { round: 'round', recommended: 'recommended', go: 'go', done: 'done', change: 'change' };
// The words the sketch tab prints itself, the keys of its labels asset but the
// language tag; its --labels file refuses any other key.
const TAB_WORDS = Object.keys(
  JSON.parse(readFileSync(new URL('../../design-ui/assets/sketch-tab-labels.json', import.meta.url), 'utf8'))
).filter((key) => key !== 'lang');

const DEFAULT_WORDS = {
  waiting: 'The first round is on its way.',
  fallbackQuestion: 'Which answers fit?',
  hint: 'Pick an answer for each question, then send the round. This tab stays open for the next one.',
  steer: 'Anything else exo should know?',
  send: 'Send note',
  received: 'Got it. The next round appears here.',
  failed: 'Your answers did not arrive. Say them in the conversation instead.',
  lost: 'This tab lost its session. Say your answers in the conversation instead.',
  round: 'Round {r} · {k} still open',
  question: 'Q{n}',
  changes: 'Changes',
  recommended: 'Recommended',
  why: 'Why 1',
  own: 'Or answer in your own words',
  submit: 'Send answers',
  allRecommended: 'All recommended',
  go: 'Go',
  goGives: 'Go takes the recommended answer for every decision still open, asked or not.',
  earlier: 'Earlier rounds',
  roundOf: 'Round {r}',
  settled: 'Settled before the questions',
  you: 'You chose',
  code: 'The code settles it',
  exo: 'exo chose',
  followed: 'as recommended',
  unlocked: 'Unlocked',
  change: 'Change',
  mapTitle: 'All decisions',
  closed: 'Closed',
  asking: 'This round',
  next: 'Next round',
  waits: 'Waits on',
  review: 'Is this what we mean?',
  done: 'Write the spec',
  changeMarked: 'Change what I marked',
  ...TEXT_WORDS
};

function requireText(value, field) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new UsageError(`--map: ${field} must be a non-empty string`);
  }
  return value.trim();
}

function requireId(value, field) {
  const id = requireText(value, field);
  if (!PLAIN_ID.test(id)) {
    throw new UsageError(`--map: ${field} '${id}' must be letters, digits, hyphens or underscores`);
  }
  return id;
}

function requireNumber(value, field) {
  if (!Number.isInteger(value) || value < 1) throw new UsageError(`--map: ${field} must be a whole number from 1`);
  return value;
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

function checkedOptions(options, field) {
  const listed = Array.isArray(options) ? options : [];
  if (listed.length < 2 || listed.length > OPTIONS_MAX) {
    throw new UsageError(`--map: ${field} must hold 2 to ${OPTIONS_MAX} answers, received ${listed.length}`);
  }
  const checked = listed.map((option, place) => checkedOption(option, `${field}[${place}]`));
  const recommendedCount = checked.filter((option) => option.recommended).length;
  if (recommendedCount !== 1) {
    throw new UsageError(`--map: ${field} must mark exactly one answer recommended, received ${recommendedCount}`);
  }
  const ids = checked.map((option) => option.id);
  const repeated = ids.find((id, index) => ids.indexOf(id) !== index);
  if (repeated) throw new UsageError(`--map: ${field} holds answer id '${repeated}' twice`);
  return checked;
}

function checkedClosed(decision, checked, field) {
  checked.answer = requireText(decision.answer, `${field}.answer`);
  if (!CLOSERS.includes(decision.closedBy)) {
    throw new UsageError(`--map: ${field}.closedBy must be one of ${CLOSERS.join(', ')}`);
  }
  checked.closedBy = decision.closedBy;
  checked.evidence = typeof decision.evidence === 'string' ? decision.evidence.trim() : '';
  if (decision.round !== undefined) checked.round = requireNumber(decision.round, `${field}.round`);
  if (decision.question !== undefined) checked.question = requireText(decision.question, `${field}.question`);
  if (decision.recommended !== undefined) checked.recommended = requireText(decision.recommended, `${field}.recommended`);
  return checked;
}

function checkedAsked(decision, checked, field) {
  checked.question = requireText(decision.question, `${field}.question`);
  checked.changes = requireText(decision.changes, `${field}.changes`);
  checked.why = requireText(decision.why, `${field}.why`);
  checked.options = checkedOptions(decision.options, `${field}.options`);
  return checked;
}

function checkedDecision(decision, index) {
  const field = `decisions[${index}]`;
  if (decision === null || typeof decision !== 'object') throw new UsageError(`--map: ${field} must be an object`);
  if (!STATES.includes(decision.state)) {
    throw new UsageError(`--map: ${field}.state must be one of ${STATES.join(', ')}`);
  }
  const checked = { id: requireId(decision.id, `${field}.id`), name: requireText(decision.name, `${field}.name`), state: decision.state };
  if (decision.waitsOn !== undefined || decision.state === 'waits') checked.waitsOn = requireId(decision.waitsOn, `${field}.waitsOn`);
  if (decision.number !== undefined) checked.number = requireNumber(decision.number, `${field}.number`);
  if (decision.state === 'closed') return checkedClosed(decision, checked, field);
  if (decision.state === 'open' && checked.number !== undefined) return checkedAsked(decision, checked, field);
  return checked;
}

const hasNumber = (decision) => decision.number !== undefined;
// Asked this round: open, numbered, and either carrying no round yet (a map
// the model wrote itself) or carrying the round now current.
const isAsked = (decision, round) => decision.state === 'open' && hasNumber(decision) && (decision.round === undefined || decision.round === round);
const byNumber = (left, right) => (left.number ?? 0) - (right.number ?? 0);

/** Refuse a waitsOn that names no decision or leads back to where it started,
 *  because the page draws the tree from these links. */
function checkTree(decisions) {
  const byId = new Map(decisions.map((decision) => [decision.id, decision]));
  for (const decision of decisions) {
    if (decision.waitsOn === undefined) continue;
    if (!byId.has(decision.waitsOn)) {
      throw new UsageError(`--map: '${decision.id}' waits on '${decision.waitsOn}', which is no decision`);
    }
    const seen = new Set([decision.id]);
    let above = byId.get(decision.waitsOn);
    while (above) {
      if (seen.has(above.id)) throw new UsageError(`--map: '${decision.id}' waits on itself through '${above.id}'`);
      seen.add(above.id);
      above = byId.get(above.waitsOn);
    }
  }
}

/** The map as the page needs it, or a UsageError naming the first field that
 *  is wrong, so the session repairs the file instead of guessing. */
export function checkedMap(map, { draft = false } = {}) {
  if (map === null || typeof map !== 'object') throw new UsageError('--map must hold a JSON object');
  if (!Array.isArray(map.decisions) || map.decisions.length === 0) {
    throw new UsageError('--map: decisions must be a non-empty array');
  }
  const round = requireNumber(map.round, 'round');
  const decisions = map.decisions.map(checkedDecision);
  const ids = decisions.map((decision) => decision.id);
  const repeated = ids.find((id, index) => ids.indexOf(id) !== index);
  if (repeated) throw new UsageError(`--map: decision id '${repeated}' appears twice`);
  const numbers = decisions.filter(hasNumber).map((decision) => decision.number);
  const repeatedNumber = numbers.find((number, index) => numbers.indexOf(number) !== index);
  if (repeatedNumber !== undefined) throw new UsageError(`--map: question number ${repeatedNumber} appears twice`);
  checkTree(decisions);
  const byId = new Map(decisions.map((decision) => [decision.id, decision]));
  // A parent that closed while its child still waited is ready now: the
  // session that wrote the map has not caught up, so the page opens it
  // itself rather than leaving it stuck behind a decision already answered.
  for (const decision of decisions) {
    if (decision.state === 'waits' && byId.get(decision.waitsOn).state === 'closed') decision.state = 'open';
  }
  const asked = decisions.filter((decision) => isAsked(decision, round));
  if (asked.length > ROUND_MAX) {
    throw new UsageError(`--map: a round asks at most ${ROUND_MAX} decisions, received ${asked.length}`);
  }
  for (const decision of asked) {
    if (decision.waitsOn === undefined) continue;
    const parent = byId.get(decision.waitsOn);
    if (parent.state !== 'closed') {
      throw new UsageError(`--map: '${decision.id}' is asked while '${decision.waitsOn}' it waits on is still ${parent.state}`);
    }
  }
  const stillOpen = decisions.some((decision) => decision.state !== 'closed');
  if (!draft && stillOpen && !decisions.some((decision) => isAsked(decision, round))) {
    throw new UsageError('--map: decisions are still open, and no open decision carries a number to ask');
  }
  const words = { ...DEFAULT_WORDS };
  for (const [key, value] of Object.entries(map.words ?? {})) {
    if (Object.hasOwn(DEFAULT_WORDS, key) && typeof value === 'string' && value.trim() !== '') words[key] = value.trim();
  }
  return {
    lang: typeof map.lang === 'string' && map.lang.trim() !== '' ? map.lang.trim() : 'en',
    goal: requireText(map.goal, 'goal'),
    round,
    decisions,
    words
  };
}

function fill(template, values) {
  return template.replace(/\{(\w)\}/g, (placeholder, key) => String(values[key] ?? placeholder));
}

function recommendedFirst(options) {
  return [...options].sort((left, right) => Number(right.recommended) - Number(left.recommended));
}

function closerText(decision, words) {
  if (decision.closedBy === 'code' && decision.evidence) return `${words.code} (${decision.evidence})`;
  return words[decision.closedBy];
}

function optionItem(decision, option, place, words) {
  const inputId = `option-${decision.id}-${option.id}`;
  const kind = option.recommended ? 'option option-recommended' : 'option';
  const badge = option.recommended ? ` <span class="badge">${escapeHtml(words.recommended)}</span>` : '';
  return `<li class="${kind}"><input type="radio" id="${inputId}" name="choice-${decision.id}" value="${escapeHtml(option.id)}"><label for="${inputId}"><span class="option-number">${place}.</span><span class="option-title"><span class="option-label">${escapeHtml(option.label)}</span>${badge}</span><span class="option-gives">${escapeHtml(option.gives)}</span></label></li>`;
}

function questionCard(decision, words) {
  const headingId = `question-${decision.id}`;
  const options = recommendedFirst(decision.options).map((option, index) => optionItem(decision, option, index + 1, words));
  const number = fill(words.question, { n: decision.number });
  return `<section class="card" aria-labelledby="${headingId}">
<p class="card-place"><span class="card-number">${escapeHtml(number)}</span> · ${escapeHtml(decision.name)}</p>
<h2 id="${headingId}" class="card-question">${escapeHtml(decision.question)}</h2>
<p class="card-changes"><span class="term">${escapeHtml(words.changes)}:</span> ${escapeHtml(decision.changes)}</p>
<ol class="options">${options.join('')}</ol>
<p class="card-why"><span class="term">${escapeHtml(words.why)}:</span> ${escapeHtml(decision.why)}</p>
<label class="own"><span>${escapeHtml(words.own)}</span><input type="text" name="words-${decision.id}" maxlength="${OWN_ANSWER_MAX}" autocomplete="off"></label>
</section>`;
}

function earlierItem(decision, map) {
  const { words } = map;
  const number = hasNumber(decision) ? `<span class="card-number">${escapeHtml(fill(words.question, { n: decision.number }))}</span> · ` : '';
  const lines = [
    `<p class="earlier-question">${number}${escapeHtml(decision.question ?? decision.name)}</p>`,
    `<p class="earlier-answer"><span class="term">${escapeHtml(closerText(decision, words))}:</span> ${escapeHtml(decision.answer)}</p>`
  ];
  if (decision.recommended !== undefined) {
    const followed = decision.recommended === decision.answer;
    const mark = followed ? ` (${escapeHtml(words.followed)})` : '';
    lines.push(`<p class="earlier-recommended"><span class="term">${escapeHtml(words.recommended)}:</span> ${escapeHtml(decision.recommended)}${mark}</p>`);
  }
  const unlocked = map.decisions.filter((other) => other.waitsOn === decision.id).map((other) => other.name);
  if (unlocked.length > 0) {
    lines.push(`<p class="earlier-unlocked"><span class="term">${escapeHtml(words.unlocked)}:</span> ${escapeHtml(unlocked.join(', '))}</p>`);
  }
  lines.push(`<label class="change"><input type="checkbox" name="reopen-${decision.id}"><span>${escapeHtml(words.change)}</span></label>`);
  return `<li class="earlier-item">${lines.join('')}</li>`;
}

function earlierGroup(summary, decisions, map, expanded) {
  const items = decisions.map((decision) => earlierItem(decision, map));
  return `<details${expanded ? ' open' : ''}><summary>${escapeHtml(summary)}</summary><ol class="earlier-list">${items.join('')}</ol></details>`;
}

/** Every closed decision, grouped by the round that asked it; the ones the
 *  code or exo settled before any round come last. The checkpoint opens every
 *  group, a round keeps them folded under its questions. */
function earlierRounds(map, expanded) {
  const { words } = map;
  const closed = map.decisions.filter((decision) => decision.state === 'closed');
  const asked = closed.filter((decision) => decision.round !== undefined).sort(byNumber);
  const rounds = [...new Set(asked.map((decision) => decision.round))].sort((left, right) => left - right);
  const groups = rounds.map((round) => earlierGroup(fill(words.roundOf, { r: round }), asked.filter((decision) => decision.round === round), map, expanded));
  const settled = closed.filter((decision) => decision.round === undefined);
  if (settled.length > 0) groups.push(earlierGroup(words.settled, settled, map, expanded));
  if (groups.length === 0) return '';
  return `<section class="earlier" aria-labelledby="earlier-title"><h2 id="earlier-title">${escapeHtml(words.earlier)}</h2>${groups.join('')}</section>`;
}

function roundActions(words) {
  return `<div class="actions"><button type="button" class="send" data-choice="${SEND.round}">${escapeHtml(words.submit)}</button><button type="button" data-choice="${SEND.recommended}">${escapeHtml(words.allRecommended)}</button><button type="button" data-choice="${SEND.go}">${escapeHtml(words.go)}</button></div><p class="actions-hint">${escapeHtml(words.goGives)}</p>`;
}

function checkpointActions(words) {
  return `<div class="actions"><button type="button" class="send" data-choice="${SEND.done}">${escapeHtml(words.done)}</button><button type="button" data-choice="${SEND.change}">${escapeHtml(words.changeMarked)}</button></div>`;
}

/** The decisions depth first from each root, so a decision sits under the one
 *  it waits on. checkedMap refused every cycle, so every decision is reached. */
function treeOrder(decisions) {
  const ordered = [];
  const visit = (decision, depth) => {
    ordered.push({ decision, depth });
    const below = decisions.filter((other) => other.waitsOn === decision.id);
    for (const child of below) visit(child, depth + 1);
  };
  const roots = decisions.filter((decision) => decision.waitsOn === undefined);
  for (const root of roots) visit(root, 0);
  return ordered;
}

function treeState(decision, map) {
  const { words } = map;
  if (decision.state === 'closed') return `${words.closed}: ${decision.answer}`;
  if (decision.state === 'waits') {
    const waitedOn = map.decisions.find((other) => other.id === decision.waitsOn);
    return `${words.waits}: ${waitedOn.name}`;
  }
  if (isAsked(decision, map.round)) return `${words.asking}: ${fill(words.question, { n: decision.number })}`;
  return words.next;
}

function decisionTree(map) {
  const items = treeOrder(map.decisions).map(({ decision, depth }) => {
    const kind = isAsked(decision, map.round) ? 'asking' : decision.state;
    const current = isAsked(decision, map.round) ? ' aria-current="step"' : '';
    return `<li class="node node-${kind}" style="--depth: ${depth}"${current}><span class="node-name">${escapeHtml(decision.name)}</span><span class="node-state">${escapeHtml(treeState(decision, map))}</span></li>`;
  });
  return `<nav class="tree" aria-labelledby="tree-title"><h2 id="tree-title">${escapeHtml(map.words.mapTitle)}</h2><ol>${items.join('')}</ol></nav>`;
}

const PAGE_STYLE = `<style>
  :root {
${CHROME_TOKENS}
  }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 24px; color: var(--ink); background: var(--ground); font: 17px/1.5 var(--font-stack); }
  .page { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); gap: 32px; max-inline-size: 1100px; margin-inline: auto; }
  .round { display: grid; gap: 24px; align-content: start; }
  h2 { margin: 0; }
  .goal { margin: 0; color: var(--ink-muted); max-inline-size: 60ch; text-wrap: pretty; }
  .term { font-weight: 650; }
  .card { display: grid; gap: 12px; padding: 20px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-control); }
  .card-place { margin: 0; font-size: 14px; font-weight: 650; color: var(--ink-muted); }
  .card-number { color: var(--ink); }
  .card-question { font-size: 26px; line-height: 1.25; font-weight: 700; max-inline-size: 40ch; text-wrap: balance; }
  .card-changes, .card-why { margin: 0; max-inline-size: 60ch; text-wrap: pretty; }
  .options { list-style: none; margin: 4px 0 0; padding: 0; display: grid; gap: 8px; }
  .option { position: relative; }
  .option input { position: absolute; inset-block-start: 17px; inset-inline-start: 14px; margin: 0; accent-color: var(--accent); }
  .option label { display: grid; grid-template-columns: auto minmax(0, 1fr); column-gap: 8px; min-block-size: 56px; padding: 12px 16px 12px 40px; border: 1px solid var(--border-control); border-radius: var(--radius-control); cursor: pointer; }
  .option-number, .option-label { font-weight: 650; }
  .option-gives { grid-column: 2; color: var(--ink-muted); }
  .option-recommended label { border: 2px solid var(--accent); }
  .option input:checked + label { background: color-mix(in oklch, var(--accent) 12%, var(--surface)); }
  .option input:focus-visible + label { outline: 3px solid var(--accent); outline-offset: 2px; }
  .badge { margin-inline-start: 8px; padding: 1px 8px; font-size: 13px; font-weight: 550; color: var(--accent-ink); background: var(--accent); border-radius: 999px; }
  .own { display: grid; gap: 4px; margin-block-start: 8px; font-size: 15px; color: var(--ink-muted); }
  .own input { font: inherit; color: var(--ink); background: var(--ground); padding: 8px 12px; border: 1px solid var(--border-control); border-radius: var(--radius-control); }
  .actions { display: flex; flex-wrap: wrap; gap: 12px; }
  .actions button { font: inherit; font-weight: 650; min-block-size: 48px; padding: 10px 20px; color: var(--ink); background: var(--surface); border: 1px solid var(--border-control); border-radius: var(--radius-control); cursor: pointer; }
  .actions .send { color: var(--accent-ink); background: var(--accent); border-color: var(--accent); }
  .actions-hint { margin: -12px 0 0; font-size: 15px; color: var(--ink-muted); }
  .earlier { display: grid; gap: 8px; }
  .earlier h2, .tree h2 { font-size: 14px; font-weight: 650; color: var(--ink-muted); }
  details { padding: 8px 16px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-control); }
  summary { min-block-size: 32px; font-weight: 650; cursor: pointer; }
  .earlier-list { list-style: none; margin: 8px 0 0; padding: 0; display: grid; gap: 12px; }
  .earlier-item { display: grid; gap: 2px; padding-block-start: 12px; border-block-start: 1px solid var(--border); overflow-wrap: anywhere; }
  .earlier-item p { margin: 0; }
  .earlier-question { font-weight: 650; }
  .change { justify-self: start; display: inline-flex; gap: 6px; align-items: center; margin-block-start: 4px; padding: 4px 10px; font-size: 15px; border: 1px solid var(--border-control); border-radius: var(--radius-control); cursor: pointer; }
  .change:has(input:checked) { border-color: var(--accent); }
  .tree ol { list-style: none; margin: 8px 0 0; padding: 0; display: grid; gap: 6px; }
  .node { display: grid; gap: 2px; margin-inline-start: calc(var(--depth) * 16px); padding: 6px 10px; font-size: 15px; border-inline-start: 3px solid var(--border); }
  .node-asking { border-inline-start-color: var(--accent); }
  .node-name { font-weight: 650; }
  .node-closed .node-name { color: var(--ink-muted); }
  /* A file path in the evidence is one unbreakable word, and it sets the whole
     column's minimum width; anywhere keeps the page inside 320px. */
  .node-state { color: var(--ink-muted); overflow-wrap: anywhere; }
  @media (max-width: 700px) { body { padding: 16px; } .page { grid-template-columns: minmax(0, 1fr); } }
</style>`;

/** One round as a sketch the tab serves: the place in <title>, which the tab
 *  prints above the page, then the cards, the earlier rounds and the tree in
 *  one form, whose fields every send button carries. Every text from the map
 *  is escaped, because an answer typed by the user comes back through it. */
export function renderRound(checked) {
  const { words } = checked;
  const asked = checked.decisions.filter(isAsked).sort(byNumber);
  const stillOpen = checked.decisions.filter((decision) => decision.state !== 'closed').length;
  const atCheckpoint = asked.length === 0;
  const title = atCheckpoint ? words.review : fill(words.round, { r: checked.round, k: stillOpen });
  const body = atCheckpoint
    ? `${earlierRounds(checked, true)}${checkpointActions(words)}`
    : `${asked.map((decision) => questionCard(decision, words)).join('')}${roundActions(words)}${earlierRounds(checked, false)}`;
  return `<title>${escapeHtml(title)}</title>
${PAGE_STYLE}
<form class="page"><div class="round"><p class="goal">${escapeHtml(checked.goal)}</p>${body}</div>${decisionTree(checked)}</form>
`;
}

/** The round the tab recorded, as the session reads it: one answer per
 *  question on the page, and the earlier decisions marked to change. An answer
 *  the page did not offer counts as none, and the checkpoint is confirmed only
 *  while nothing is marked, because a change outranks the send button. */
export function roundAnswer(checked, recorded) {
  const fields = recorded.fields ?? {};
  const sent = recorded.choice;
  const takesRecommended = sent === SEND.recommended || sent === SEND.go;
  const asked = checked.decisions.filter((decision) => isAsked(decision, checked.round)).sort(byNumber);
  const answers = asked.map((decision) => {
    const typed = fields[`words-${decision.id}`];
    const own = typeof typed === 'string' ? typed.trim() : '';
    const picked = takesRecommended
      ? decision.options.find((option) => option.recommended)
      : decision.options.find((option) => option.id === fields[`choice-${decision.id}`]);
    return { decision: decision.id, choice: picked?.id ?? null, label: picked?.label ?? '', words: own };
  });
  const closed = checked.decisions.filter((decision) => decision.state === 'closed');
  const reopen = closed.filter((decision) => fields[`reopen-${decision.id}`] !== undefined).map((decision) => decision.id);
  return {
    round: checked.round,
    answers,
    reopen,
    go: sent === SEND.go,
    done: sent === SEND.done && reopen.length === 0,
    words: recorded.steer ?? ''
  };
}

/** The map file's raw JSON object, or null when it is missing and the caller
 *  allows that (--add creates the file). Any other read or parse failure is a
 *  usage error naming the file. */
async function readRawMap(file, { allowMissing = false } = {}) {
  if (!file) throw new UsageError('--map <map.json> is required');
  let written;
  try {
    written = await fs.readFile(file, 'utf8');
  } catch (error) {
    if (allowMissing && error.code === 'ENOENT') return null;
    throw new UsageError(`--map file '${file}' cannot be read`);
  }
  try {
    return JSON.parse(written);
  } catch (error) {
    throw new UsageError(`--map file '${file}' is not valid JSON: ${error.message}`);
  }
}

async function readMap(file, options) {
  return checkedMap(await readRawMap(file), options);
}

async function readJsonFile(file, flag) {
  let written;
  try {
    written = await fs.readFile(file, 'utf8');
  } catch {
    throw new UsageError(`${flag} file '${file}' cannot be read`);
  }
  try {
    return JSON.parse(written);
  } catch (error) {
    throw new UsageError(`${flag}: '${file}' is not valid JSON: ${error.message}`);
  }
}

/** The map written atomically: a temp file beside it, then a rename, so a
 *  process that dies mid-write never leaves a half-written map.json. */
async function writeMap(file, map) {
  const temp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(temp, `${JSON.stringify(map, null, 2)}\n`);
  await fs.rename(temp, file);
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
  const place = map.decisions.some(isAsked) ? `round-${map.round}` : 'checkpoint';
  const sketch = `${String(written + 1).padStart(3, '0')}-${place}.html`;
  await fs.writeFile(path.join(directory, sketch), renderRound(map));
  const args = ['--wait', directory, '--sketch', sketch];
  if (flags.timeout !== undefined) args.push('--timeout', flags.timeout);
  const { code, stdout } = await runSketchTab(args);
  if (code === 3) {
    // The child's own stderr line ends "the recommended option stands", read
    // on its own as license to pick it; this line overrides that reading.
    process.stderr.write('question page: no answer to draw from; ask this round in the conversation, never pick for the user\n');
  }
  if (code !== 0) {
    process.exitCode = code;
    return;
  }
  const recorded = JSON.parse(stdout);
  process.stdout.write(`${JSON.stringify(roundAnswer(map, recorded))}\n`);
}

/** --add and --apply own every map transition; --apply runs first when both
 *  are given, then --add, then the map moves to what the next round asks.
 *  --text, alone or trailing either, prints the chat layout for what the
 *  written (or unchanged) map now asks. */
async function addApplyText(flags) {
  if (flags.add === undefined && flags.apply === undefined && !flags.text) {
    throw new UsageError('give at least one of --add, --apply and --text');
  }
  let map = await readRawMap(flags.map, { allowMissing: flags.add !== undefined });
  if (map !== null) checkedMap(map, { draft: true });
  const lines = [];
  let changed = false;

  if (flags.apply !== undefined) {
    if (map === null) throw new UsageError(`--apply: no map exists yet at '${flags.map}'`);
    const answer = await readJsonFile(flags.apply, '--apply');
    const result = applyAnswer(map, answer);
    map = result.map;
    lines.push(...result.lines);
    changed = true;
  }
  if (flags.add !== undefined) {
    const additions = await readJsonFile(flags.add, '--add');
    const result = addDecisions(map, additions);
    map = result.map;
    lines.push(...result.lines);
    changed = true;
  }
  if (changed) {
    const result = nextRound(map);
    map = result.map;
    lines.push(...result.lines);
    checkedMap(map, { draft: true });
    await writeMap(flags.map, map);
  }
  for (const line of lines) process.stdout.write(`${line}\n`);
  if (flags.text) {
    const checked = changed ? checkedMap(map) : await readMap(flags.map);
    process.stdout.write(`${renderText(checked)}\n`);
  }
}

async function main(argv) {
  const flags = parseFlags(argv, {
    serve: 'value',
    ask: 'value',
    map: 'value',
    timeout: 'value',
    'no-open': 'boolean',
    add: 'value',
    apply: 'value',
    text: 'boolean'
  });
  const groupGiven = flags.add !== undefined || flags.apply !== undefined || flags.text === true;
  const modes = [flags.serve !== undefined, flags.ask !== undefined, groupGiven].filter(Boolean).length;
  if (modes !== 1) {
    throw new UsageError('give exactly one of --serve <dir>, --ask <dir>, and --add/--apply/--text');
  }
  if (flags.serve !== undefined) return serve(flags);
  if (flags.ask !== undefined) return ask(flags);
  if (!flags.map) throw new UsageError('--map <map.json> is required');
  return addApplyText(flags);
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

import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';

const text = fs.readFileSync(new URL('../skills/prompt/SKILL.md', import.meta.url), 'utf8');
const [, frontmatter, body] = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
const description = frontmatter.match(/^description: (.*)$/m)[1];

function section(name) {
  const match = body.match(new RegExp(`^## ${name}\\r?\\n([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, 'm'));
  assert.ok(match, `missing ## ${name}`);
  return match[1];
}

test('description allows code reading, stays short and keeps manual invocation', () => {
  assert.ok(description.length <= 250, `description is ${description.length} characters`);
  assert.doesNotMatch(description, /code reading|questions or code/i);
  assert.match(description, /unseen/);
  assert.match(frontmatter, /^disable-model-invocation: true$/m);
});

test('reading is read-only and limited to what the rewrite names', () => {
  const run = section('Run');
  assert.match(run, /Glob, Grep, Read, the package manifest/);
  assert.match(run, /path, a test or build command, or a pattern file/);
  assert.match(run, /No edit, no test run, no helper/);
  assert.doesNotMatch(body, /Read no code|run no tool|ask no question|Add no .*question/i);
  assert.doesNotMatch(body, /spec handles it/);
});

test('questions are capped at 2 and need a material difference', () => {
  const run = section('Run');
  assert.match(run, /at most 2/);
  assert.match(run, /materially different work/);
  assert.match(run, /route-skills\/references\/question\.md/);
  assert.match(run, /one per message/);
});

test('approval flow is unchanged', () => {
  const run = section('Run');
  assert.match(run, /No argument → print `\/exo:prompt <rough prompt>`/);
  assert.match(run, /plain yes or ok/i);
  assert.match(run, /"yes, but drop X"/);
  assert.match(run, /Any other reply → stop/);
});

test('the Added: line lists each add with its basis', () => {
  assert.match(body, /`Added:` line/);
  assert.match(body, /user's words/);
  assert.match(body, /path or command read/);
  assert.match(body, /kind rule/);
  assert.match(body, /never a guessed fact/);
});

test('the five tags appear in order', () => {
  const tags = ['<context>', '<pasted_content source=', '<instructions>', '<success_criteria>', '<output_format>'];
  let at = -1;
  for (const tag of tags) {
    const next = body.indexOf(tag, at + 1);
    assert.ok(next > at, `${tag} missing or out of order`);
    at = next;
  }
  assert.match(body, /<documents>/);
  assert.match(body, /<document_content>/);
});

test('each kind rule is present', () => {
  const rules = [
    /reproduce it with a failing test first, then fix the cause; do not silence the error/,
    /do not hard-code values that only make the tests pass/,
    /only make changes that are directly requested or clearly necessary/,
    /pattern file/,
    /screenshot check/,
    /cross-check claims across sources and state confidence/,
    /explore broadly before acting/,
    /do not edit/,
    /keep working until every part is done; a closing summary that announces a next step is not done/,
  ];
  for (const rule of rules) assert.match(body, rule);
});

test('strip rules keep ultrathink and drop emphasis, roles and prefill', () => {
  const strip = section('Strip');
  assert.match(strip, /`ultrathink`/);
  assert.match(strip, /"double-check"/);
  assert.match(strip, /CAPS/);
  assert.match(strip, /[Rr]ole lines/);
  assert.match(strip, /start your answer with/);
  assert.match(strip, /briefly explain why/);
});

test('one model line per model', () => {
  const model = section('Model');
  for (const name of ['Opus 5.5', 'Sonnet 5.5', 'Fable']) assert.match(model, new RegExp(name));
  assert.match(model, /any other or unknown model/i);
  assert.match(model, /keep working until every part is done/);
});

test('example rewrites the three lazy inputs', () => {
  const example = section('Example');
  assert.match(example, /fix the login bug/);
  assert.match(example, /make my landing page better/);
  assert.match(example, /research competitors and make a report/);
  assert.match(example, /<context>/);
  assert.match(example, /^Added:/m);
  assert.doesNotMatch(example, /TS2345/);
});

test('the Added: line is not ordered after every block', () => {
  const run = section('Run');
  assert.doesNotMatch(run, /After the block, one `Added:` line, then/);
  assert.match(run, /`Added:` line only when/);
});

test('the example states no fact the rough prompt lacks', () => {
  assert.doesNotMatch(section('Example'), /Users report/);
});

test('skill text carries no research ids', () => {
  assert.doesNotMatch(body, /\bR\d{1,2}\b/);
});

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { gitRepository } from './harness.mjs';

const PLAN_TEMPLATE = path.resolve('skills/spec/scripts/plan-template.mjs');
const PLAN_CHECK = path.resolve('skills/spec/scripts/plan-check.mjs');

const TEMPLATE = (criterion) => [
  '---',
  'name: add-endpoint',
  'summary: Add an HTTP endpoint with its handler and test',
  'params: branch, resource',
  '---',
  '# Plan: add the {{resource}} endpoint',
  '',
  '## Goal',
  'The {{resource}} endpoint answers requests.',
  '',
  '## Plan basis',
  'Repository: {{root}}',
  'Branch: {{branch}}',
  'Worktree setup: none',
  'Land gate: none',
  'Land: local',
  'Commit: feat(api): add the {{resource}} endpoint',
  'Lint: none',
  'Allow: none',
  '',
  '## Success criterion',
  criterion,
  'Red: none (each task Proof proves its own red)',
  '',
  '## Checkpoint',
  '- Blocks first: none.',
  '- Parallel: none.',
  '- Shared state: none.',
  '- Smallest safe split: one task per module.',
  '',
  '## Tasks',
  '### Task 1: feat(api): add the {{resource}} handler',
  'Depends on: none | Files: `src/{{resource}}.js`, `src/{{resource}}.test.js` | Data: a handler function over the request object | Proof: node --test src/{{resource}}.test.js',
  ''
].join('\n');

async function repository({ criterion = '`node --test` passes.', done = null } = {}) {
  const files = { 'docs/plans/templates/add-endpoint.md': TEMPLATE(criterion) };
  if (done !== null) files['docs/plans/definition-of-done.md'] = done;
  return gitRepository(files);
}

function template(root, ...args) {
  return spawnSync('node', [PLAN_TEMPLATE, ...args, '--root', root], { encoding: 'utf8' });
}

async function render(root, resource) {
  const out = path.join(root, '.exo', `${resource}.md`);
  await fs.mkdir(path.dirname(out), { recursive: true });
  const result = template(root, 'render', '--template', 'add-endpoint', '--param', `resource=${resource}`, '--param', 'branch=feat/orders', '--out', out);
  assert.equal(result.status, 0, result.stderr);
  return { out, text: await fs.readFile(out, 'utf8') };
}

function check(root, planPath) {
  return spawnSync('node', [PLAN_CHECK, '--plan', planPath, '--root', root], { encoding: 'utf8' });
}

const occurrences = (text, needle) => text.split(needle).length - 1;

test('a template rendered with new parameters is a plan the plan check accepts', async () => {
  const root = await repository();
  const { out, text } = await render(root, 'orders');
  assert.ok(text.includes(`Repository: ${root}`) && text.includes('Branch: feat/orders'));
  assert.ok(text.includes('src/orders.js') && !text.includes('{{'));
  const result = check(root, out);
  assert.equal(result.status, 0, result.stdout + result.stderr);
});

test('each done-list command lands once in the Success criterion, also when the template holds one', async () => {
  const done = '# Definition of done\n\n- `npm run lint`\n- `npm run docs`\nprose line\n- `npm run lint`\n';
  const root = await repository({ criterion: '`node --test && npm run lint` passes.', done });
  const { out, text } = await render(root, 'invoices');
  assert.equal(occurrences(text, 'npm run lint'), 1);
  assert.equal(occurrences(text, 'npm run docs'), 1);
  const again = template(root, 'done', '--plan', out);
  assert.equal(again.status, 0, again.stderr);
  assert.equal(await fs.readFile(out, 'utf8'), text);
  assert.equal(check(root, out).status, 0);
});

test('a missing parameter is refused and a saved plan reruns as a template', async () => {
  const root = await repository();
  const missing = template(root, 'render', '--template', 'add-endpoint', '--param', 'resource=orders');
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /missing parameters: --param branch=/);
  const { out } = await render(root, 'orders');
  const saved = template(root, 'save', '--plan', out, '--name', 'orders-copy', '--summary', 'Copy of the orders plan', '--param', 'orders=resource');
  assert.equal(saved.status, 0, saved.stderr);
  const stored = await fs.readFile(path.join(root, 'docs/plans/templates/orders-copy.md'), 'utf8');
  assert.ok(!stored.includes(root) && stored.includes('{{resource}}') && stored.includes('params: branch, resource'));
  const listed = template(root, 'list');
  assert.match(listed.stdout, /orders-copy\tCopy of the orders plan\tparams: branch, resource/);
});

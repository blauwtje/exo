// The `--size` path of `repo-fields.mjs`: a size ladder over max(paths,
// criteria), its fixed estimate, and a priority ranked by shape, --shipped
// or --blocking, against a given options list or the default P0/P1/P2.
// The default path: reading the repository's vocabulary through a gh
// stand-in, caching it for a day, and the optional reads that fall back
// to an empty list instead of failing the whole run.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { fixture, run } from './harness.mjs';
import { sizeFields } from '../skills/issuing/scripts/repo-fields.mjs';

const REPO_FIELDS = fileURLToPath(new URL('../skills/issuing/scripts/repo-fields.mjs', import.meta.url));

const spec = (paths, criteria) => sizeFields({ paths, criteria, shape: 'spec' });

test('size follows max(paths, criteria) on a five-step ladder, 0 counting as XS', () => {
  assert.equal(spec(0, 0).size, 'XS');
  assert.equal(spec(1, 0).size, 'XS');
  assert.equal(spec(0, 2).size, 'S');
  assert.equal(spec(3, 1).size, 'S');
  assert.equal(spec(4, 0).size, 'M');
  assert.equal(spec(2, 6).size, 'M');
  assert.equal(spec(7, 3).size, 'L');
  assert.equal(spec(0, 12).size, 'L');
  assert.equal(spec(13, 0).size, 'XL');
});

test('estimate reads off size on a fixed table', () => {
  assert.equal(spec(1, 0).estimate, 1);
  assert.equal(spec(2, 0).estimate, 2);
  assert.equal(spec(4, 0).estimate, 3);
  assert.equal(spec(7, 0).estimate, 8);
  assert.equal(spec(13, 0).estimate, 13);
});

test('priority ranks report+shipped highest, the other report and spec+blocking middle, a plain spec lowest', () => {
  assert.equal(sizeFields({ paths: 1, criteria: 0, shape: 'report', shipped: true }).priority, 'P0');
  assert.equal(sizeFields({ paths: 1, criteria: 0, shape: 'report' }).priority, 'P1');
  assert.equal(sizeFields({ paths: 1, criteria: 0, shape: 'spec', blocking: true }).priority, 'P1');
  assert.equal(sizeFields({ paths: 1, criteria: 0, shape: 'spec' }).priority, 'P2');
});

test('a 3-option list gives a clean middle option', () => {
  const options = ['High', 'Mid', 'Low'];
  assert.equal(sizeFields({ paths: 1, criteria: 0, shape: 'report', shipped: true, options }).priority, 'High');
  assert.equal(sizeFields({ paths: 1, criteria: 0, shape: 'report', options }).priority, 'Mid');
  assert.equal(sizeFields({ paths: 1, criteria: 0, shape: 'spec', blocking: true, options }).priority, 'Mid');
  assert.equal(sizeFields({ paths: 1, criteria: 0, shape: 'spec', options }).priority, 'Low');
});

test('a 5-option list picks the option at the floor((n-1)/2) index', () => {
  const options = ['P0', 'P1', 'P2', 'P3', 'P4'];
  assert.equal(sizeFields({ paths: 1, criteria: 0, shape: 'report', shipped: true, options }).priority, 'P0');
  assert.equal(sizeFields({ paths: 1, criteria: 0, shape: 'report', options }).priority, 'P2');
  assert.equal(sizeFields({ paths: 1, criteria: 0, shape: 'spec', blocking: true, options }).priority, 'P2');
  assert.equal(sizeFields({ paths: 1, criteria: 0, shape: 'spec', options }).priority, 'P4');
});

test('a 2-option list has no distinct middle, so the middle cases fall on the first option', () => {
  const options = ['Now', 'Later'];
  assert.equal(sizeFields({ paths: 1, criteria: 0, shape: 'report', shipped: true, options }).priority, 'Now');
  assert.equal(sizeFields({ paths: 1, criteria: 0, shape: 'report', options }).priority, 'Now');
  assert.equal(sizeFields({ paths: 1, criteria: 0, shape: 'spec', blocking: true, options }).priority, 'Now');
  assert.equal(sizeFields({ paths: 1, criteria: 0, shape: 'spec', options }).priority, 'Later');
});

test('CLI --size prints one compact JSON line', async () => {
  const outcome = await run(REPO_FIELDS, ['--size', '--paths', '3', '--criteria', '5', '--shape', 'spec']);
  assert.equal(outcome.code, 0, outcome.stderr);
  assert.equal(outcome.stdout, '{"size":"M","estimate":3,"priority":"P2"}\n');
});

test('a bad --shape exits 2 with empty stdout', async () => {
  const outcome = await run(REPO_FIELDS, ['--size', '--paths', '3', '--criteria', '5', '--shape', 'bogus']);
  assert.equal(outcome.code, 2);
  assert.equal(outcome.stdout, '');
});

test('a missing --paths exits 2 with empty stdout', async () => {
  const outcome = await run(REPO_FIELDS, ['--size', '--criteria', '5', '--shape', 'spec']);
  assert.equal(outcome.code, 2);
  assert.equal(outcome.stdout, '');
});

// Stands in for gh: logs its argv, one line per call, then answers by
// subcommand. STAND_IN_MODE selects the failure or vocabulary scenario.
const STAND_IN = [
  '#!/usr/bin/env node',
  "const fs = require('node:fs');",
  "fs.appendFileSync(process.env.STAND_IN_LOG, process.argv.slice(2).join(' ') + '\\n');",
  'const mode = process.env.STAND_IN_MODE;',
  'const args = process.argv.slice(2);',
  "if (args[0] === 'repo' && args[1] === 'view') {",
  "  if (mode === 'repo-view-fail') { console.error('gh: authentication required'); process.exit(1); }",
  "  console.log(JSON.stringify({ owner: { login: 'acme' }, name: 'widgets', defaultBranchRef: { name: 'main' } }));",
  '  process.exit(0);',
  '}',
  "if (args[0] === 'label' && args[1] === 'list') {",
  "  const names = mode === 'default-labels' ? ['bug', 'enhancement'] : ['bug', 'enhancement', 'needs-design'];",
  '  console.log(JSON.stringify(names));',
  '  process.exit(0);',
  '}',
  "if (args[0] === 'api' && args[1] === 'graphql') {",
  "  console.log(JSON.stringify(mode === 'default-labels' ? [] : ['bug report']));",
  '  process.exit(0);',
  '}',
  "if (args[0] === 'api') {",
  "  console.log(JSON.stringify([{ number: 1, title: 'v1' }]));",
  '  process.exit(0);',
  '}',
  "if (args[0] === 'project' && args[1] === 'list') {",
  "  if (mode === 'project-list-fail') { console.error('gh: project list failed'); process.exit(1); }",
  "  console.log(JSON.stringify(mode === 'default-labels' ? [] : [{ number: 5, title: 'Board', id: 'PVT_1' }]));",
  '  process.exit(0);',
  '}',
  "if (args[0] === 'project' && args[1] === 'field-list') {",
  "  console.log(JSON.stringify([{ id: 'F1', name: 'Status', options: [{ id: 'O1', name: 'Todo' }] }]));",
  '  process.exit(0);',
  '}',
  "if (args[0] === 'issue' && args[1] === 'list') {",
  "  console.log(JSON.stringify(['Fix the widget']));",
  '  process.exit(0);',
  '}',
  "console.error('stand-in: unhandled call ' + args.join(' '));",
  'process.exit(1);',
  ''
].join('\n');

// A real git repository with one issue template, so `readdirSync` and
// `git rev-parse --show-toplevel` have real answers to give.
async function repoFieldsFixture() {
  const directory = await fixture();
  const bin = path.join(directory, 'bin');
  await fs.mkdir(bin);
  await fs.writeFile(path.join(bin, 'gh'), STAND_IN, { mode: 0o755 });
  await fs.mkdir(path.join(directory, '.github', 'ISSUE_TEMPLATE'), { recursive: true });
  await fs.writeFile(path.join(directory, '.github', 'ISSUE_TEMPLATE', 'bug.md'), '---\nname: Bug\n---\n');
  execFileSync('git', ['init', '-q'], { cwd: directory });
  return { directory, bin, log: path.join(directory, 'calls.log') };
}

function runRepoFields(fixtureState, mode, args = []) {
  return run(REPO_FIELDS, args, {
    cwd: fixtureState.directory,
    env: {
      PATH: `${fixtureState.bin}${path.delimiter}${process.env.PATH}`,
      STAND_IN_LOG: fixtureState.log,
      STAND_IN_MODE: mode
    }
  });
}

async function loggedCalls(fixtureState) {
  const logged = await fs.readFile(fixtureState.log, 'utf8').catch(() => '');
  return logged.split('\n').filter((line) => line !== '');
}

function cacheFile(directory) {
  const gitDirectory = execFileSync('git', ['-C', directory, 'rev-parse', '--path-format=absolute', '--git-common-dir'], { encoding: 'utf8' }).trim();
  return path.join(gitDirectory, 'exo', 'fields.json');
}

test('the first run reads the repository through gh, prints it, and caches it', async () => {
  const fixtureState = await repoFieldsFixture();
  const outcome = await runRepoFields(fixtureState, 'own');
  assert.equal(outcome.code, 0, outcome.stderr);
  const data = JSON.parse(outcome.stdout);
  assert.deepEqual(data.labels, ['bug', 'enhancement', 'needs-design']);
  assert.equal(data.projects.length, 1);
  assert.deepEqual(data.projects[0].fields, [{ id: 'F1', name: 'Status', options: [{ id: 'O1', name: 'Todo' }] }]);
  assert.deepEqual(data.issueTemplates, ['bug.md']);
  assert.equal(data.vocabulary, 'own');

  const calls = await loggedCalls(fixtureState);
  assert.ok(calls.some((call) => call.startsWith('repo view')));
  assert.ok(calls.some((call) => call.startsWith('label list')));
  assert.ok(calls.some((call) => call.startsWith('project list')));
  assert.ok(calls.some((call) => call.startsWith('project field-list 5')));

  const cached = JSON.parse(await fs.readFile(cacheFile(fixtureState.directory), 'utf8'));
  assert.equal(cached.vocabulary, 'own');
});

test('a second run inside the cache day spawns no gh', async () => {
  const fixtureState = await repoFieldsFixture();
  await runRepoFields(fixtureState, 'own');
  const firstCallCount = (await loggedCalls(fixtureState)).length;

  const outcome = await runRepoFields(fixtureState, 'own');
  assert.equal(outcome.code, 0, outcome.stderr);
  assert.equal((await loggedCalls(fixtureState)).length, firstCallCount);
});

test('--refresh bypasses a fresh cache and spawns gh again', async () => {
  const fixtureState = await repoFieldsFixture();
  await runRepoFields(fixtureState, 'own');
  const firstCallCount = (await loggedCalls(fixtureState)).length;

  const outcome = await runRepoFields(fixtureState, 'own', ['--refresh']);
  assert.equal(outcome.code, 0, outcome.stderr);
  assert.ok((await loggedCalls(fixtureState)).length > firstCallCount);
});

test('a cache 25 hours old is stale and refetches', async () => {
  const fixtureState = await repoFieldsFixture();
  await runRepoFields(fixtureState, 'own');
  const firstCallCount = (await loggedCalls(fixtureState)).length;

  const file = cacheFile(fixtureState.directory);
  const stale = JSON.parse(await fs.readFile(file, 'utf8'));
  stale.fetchedAt = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
  await fs.writeFile(file, `${JSON.stringify(stale)}\n`);

  const outcome = await runRepoFields(fixtureState, 'own');
  assert.equal(outcome.code, 0, outcome.stderr);
  assert.ok((await loggedCalls(fixtureState)).length > firstCallCount);
});

test('a failing repo view exits 3 and writes no cache', async () => {
  const fixtureState = await repoFieldsFixture();
  const outcome = await runRepoFields(fixtureState, 'repo-view-fail');
  assert.equal(outcome.code, 3);
  assert.match(outcome.stdout, /^fields: error gh=gh: authentication required/);
  await assert.rejects(fs.readFile(cacheFile(fixtureState.directory), 'utf8'));
});

test('a failing project list still exits 0 with an empty projects list and an unread entry', async () => {
  const fixtureState = await repoFieldsFixture();
  const outcome = await runRepoFields(fixtureState, 'project-list-fail');
  assert.equal(outcome.code, 0, outcome.stderr);
  const data = JSON.parse(outcome.stdout);
  assert.deepEqual(data.projects, []);
  assert.ok(data.unread.some((entry) => entry.startsWith('projects:')));
});

test('only default labels and no types or project fields gives vocabulary "default"', async () => {
  const fixtureState = await repoFieldsFixture();
  const outcome = await runRepoFields(fixtureState, 'default-labels');
  assert.equal(outcome.code, 0, outcome.stderr);
  const data = JSON.parse(outcome.stdout);
  assert.deepEqual(data.types, []);
  assert.deepEqual(data.projects, []);
  assert.equal(data.vocabulary, 'default');
});

test('the issuing skill names the script instead of the six-command read', async () => {
  const skill = await fs.readFile(fileURLToPath(new URL('../skills/issuing/SKILL.md', import.meta.url)), 'utf8');
  const frontmatter = skill.split('---')[1];
  assert.match(frontmatter, /Bash\(node \*repo-fields\.mjs\*\)/);

  const fieldsDoc = await fs.readFile(fileURLToPath(new URL('../skills/issuing/references/fields.md', import.meta.url)), 'utf8');
  assert.match(fieldsDoc, /scripts\/repo-fields\.mjs/);
  assert.doesNotMatch(fieldsDoc, /gh label list/);
  assert.doesNotMatch(fieldsDoc, /ls \.github\/ISSUE_TEMPLATE/);
});

test('the shipping skill names the sibling script for a pull request with no issue', async () => {
  const skill = await fs.readFile(fileURLToPath(new URL('../skills/shipping/SKILL.md', import.meta.url)), 'utf8');
  const frontmatter = skill.split('---')[1];
  assert.match(frontmatter, /Bash\(node \*repo-fields\.mjs\*\)/);
  assert.match(skill, /\.\.\/issuing\/scripts\/repo-fields\.mjs/);
});

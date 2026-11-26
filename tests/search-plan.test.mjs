import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { SEARCH_TIERS } from '#shared-values';
import { run, tempDir } from './harness.mjs';

const SCRIPT = fileURLToPath(new URL('../skills/search/scripts/plan.mjs', import.meta.url));

async function plan(subs, extra = ['--tier', 'standard']) {
  const folder = tempDir();
  const file = path.join(folder, 'subs.json');
  fs.writeFileSync(file, JSON.stringify(subs));
  const result = await run(SCRIPT, ['--question', 'How do people test skills?', '--subs', file, ...extra], { cwd: folder });
  const dir = result.stdout.match(/^Run: (.+)$/m)?.[1];
  return { ...result, dir, plan: dir && JSON.parse(fs.readFileSync(path.join(dir, 'plan.json'), 'utf8')) };
}

const FOUR = ['a one', 'b two', 'c three', 'd four'];

test('plan.json holds ids, calls, an ISO deadline and status open per sub', async () => {
  const { code, dir, plan: written } = await plan(FOUR);
  assert.equal(code, 0);
  assert.equal(written.tier, 'standard');
  assert.deepEqual(written.subQuestions.map((sub) => sub.id), ['Q1', 'Q2', 'Q3', 'Q4']);
  const [first] = written.subQuestions;
  assert.equal(first.ask, 'a one');
  assert.equal(first.calls, SEARCH_TIERS.standard.calls);
  assert.equal(first.status, 'open');
  const wait = Date.parse(first.deadline) - fs.statSync(path.join(dir, 'plan.json')).mtimeMs;
  assert.ok(Math.abs(wait - SEARCH_TIERS.standard.minutes * 60 * 1000) < 5000);
});

test('one ready worker prompt per sub is printed', async () => {
  const { stdout, dir } = await plan(FOUR);
  const prompts = stdout.split(/^Worker Q\d+:$/m).slice(1);
  assert.equal(prompts.length, 4);
  assert.match(prompts[1], /^Sources: web$/m);
  assert.ok(prompts[1].includes(dir));
  assert.ok(prompts[1].includes('Q2'));
  assert.ok(prompts[1].includes('b two'));
  assert.ok(prompts[1].includes(`${SEARCH_TIERS.standard.pages}`));
  assert.ok(prompts[1].includes('references/worker.md'));
  assert.doesNotMatch(stdout, /<[a-z ]+>/);
});

test('hosts are written to plan.json', async () => {
  const { plan: written } = await plan(FOUR, ['--tier', 'standard', '--hosts', 'a.com,b.org']);
  assert.deepEqual(written.hosts, ['a.com', 'b.org']);
});

test('a sub count outside the tier fails', async () => {
  const { code, stderr } = await plan(['only one']);
  assert.equal(code, 1);
  assert.match(stderr, /standard/);
});

test('a deep plan prints and stores the run deadline from runMinutes', async () => {
  const eight = Array.from({ length: SEARCH_TIERS.deep.workers[0] }, (_, index) => `ask ${index}`);
  const { stdout, plan: written } = await plan(eight, ['--tier', 'deep']);
  const printed = stdout.match(/^Run deadline: (.+)$/m)?.[1];
  assert.equal(printed, written.runDeadline);
  const wait = Date.parse(printed) - Date.parse(written.subQuestions[0].deadline);
  assert.equal(wait, (SEARCH_TIERS.deep.runMinutes - SEARCH_TIERS.deep.minutes) * 60 * 1000);
});

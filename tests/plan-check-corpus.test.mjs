import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { fixture, gitRepository, run } from './harness.mjs';

const PLAN_CHECK = fileURLToPath(new URL('../skills/spec/scripts/plan-check.mjs', import.meta.url));
const CORPUS = fileURLToPath(new URL('./fixtures/plans', import.meta.url));
const EXAMPLE_PLAN = fileURLToPath(new URL('../skills/spec/references/example-plan.md', import.meta.url));
const HEADER = /^<!-- (expect|repo|flags): (.*) -->$/;

function parseHeader(text) {
  const header = {};
  for (const line of text.split('\n')) {
    const match = line.match(HEADER);
    if (match === null) break;
    header[match[1]] = match[2];
  }
  return header;
}

function seedFiles(repo) {
  const paths = (repo ?? 'README.md').split(',').map((entry) => entry.trim()).filter(Boolean);
  return Object.fromEntries(paths.map((entry) => [entry, `${paths.join('\n')}\n`]));
}

async function check(planText, header) {
  const root = await gitRepository(seedFiles(header.repo));
  const planPath = path.join(await fixture(), 'plan.md');
  fs.writeFileSync(planPath, planText);
  const flags = (header.flags ?? '').split(' ').filter(Boolean);
  const rootArguments = flags.includes('noroot') ? [] : ['--root', root];
  const result = await run(PLAN_CHECK, ['--plan', planPath, ...rootArguments, ...flags.filter((flag) => flag !== 'noroot')]);
  const lines = result.stdout.split('\n').map((line) => line.replaceAll(root, '<root>'));
  return { code: result.code, first: lines[0] };
}

function fixturesIn(directory) {
  return fs.readdirSync(path.join(CORPUS, directory)).filter((name) => name.endsWith('.md')).sort().map((name) => path.join(CORPUS, directory, name));
}

for (const [directory, code] of [['ok', 0], ['bad', 1]]) {
  for (const file of fixturesIn(directory)) {
    test(`corpus ${directory}/${path.basename(file)}`, async () => {
      const text = fs.readFileSync(file, 'utf8');
      const header = parseHeader(text);
      assert.ok(header.expect !== undefined, 'the first line reads <!-- expect: ok --> or <!-- expect: <first refusal line> -->');
      const outcome = await check(text, header);
      assert.equal(outcome.code, code, outcome.first);
      if (code === 0) assert.equal(header.expect, 'ok');
      else assert.equal(outcome.first, header.expect);
    });
  }
}

test('corpus example-plan.md passes plan-check', async () => {
  const outcome = await check(fs.readFileSync(EXAMPLE_PLAN, 'utf8'), {});
  assert.equal(outcome.code, 0, outcome.first);
});

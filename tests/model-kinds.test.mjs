// The kind table names real files, and what it says about a skill's
// frontmatter and a prompt-file dispatch is what those files hold today.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { readKindTable, TABLE_PATH } from '#model-kinds';

const ROOT = new URL('../', import.meta.url).pathname;
const MODEL_WORD = /`(opus|sonnet|haiku)`/g;

const table = readKindTable();

function readRepoFile(file) {
  return fs.readFileSync(path.join(ROOT, file), 'utf8');
}

function frontmatterField(file, field) {
  const frontmatter = readRepoFile(file).split('---')[1];
  const line = frontmatter.split('\n').find((row) => row.startsWith(`${field}:`));
  return line ? line.slice(field.length + 1).trim() : null;
}

function readTableWith(change) {
  const copy = JSON.parse(fs.readFileSync(TABLE_PATH, 'utf8'));
  change(copy);
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'kinds-')), 'table.json');
  fs.writeFileSync(file, JSON.stringify(copy));
  return () => readKindTable(file);
}

test('every kind resolves through the claude block to a model and an effort or null', () => {
  assert.deepEqual(Object.keys(table.kinds).sort(), [
    'build', 'chore', 'coordinate', 'handover', 'hardest', 'investigate',
    'lookup', 'prose', 'research', 'review', 'review-deep'
  ]);
  assert.deepEqual(table.kinds.hardest, { model: 'opus', effort: 'xhigh' });
  assert.deepEqual(table.kinds.build, { model: 'sonnet', effort: 'high' });
  assert.deepEqual(table.kinds.lookup, { model: 'haiku', effort: null });
  assert.deepEqual(table.kinds.handover, { model: 'inherit', effort: null });
});

test('the raw table names a tier and a neutral effort per kind, and the claude block maps them', () => {
  const raw = JSON.parse(fs.readFileSync(TABLE_PATH, 'utf8'));
  assert.equal(raw.provider, 'claude');
  assert.deepEqual(raw.providers.claude.tiers, { strong: 'opus', standard: 'sonnet', fast: 'haiku' });
  assert.deepEqual(raw.providers.claude.models, ['fable', 'opus', 'sonnet', 'haiku']);
  assert.deepEqual(Object.keys(raw.providers.claude.efforts), ['low', 'medium', 'high', 'xhigh', 'max']);
  assert.deepEqual(raw.kinds.hardest, { tier: 'strong', effort: 'xhigh' });
  assert.deepEqual(raw.kinds.lookup, { tier: 'fast', effort: null });
});

test('the reader resolves a kind through whichever provider block is active', () => {
  const resolved = readTableWith((copy) => {
    copy.provider = 'other';
    copy.providers.other = {
      models: ['big', 'mid', 'small'],
      tiers: { strong: 'big', standard: 'mid', fast: 'small' },
      efforts: { low: 'l', medium: 'm', high: 'h', xhigh: 'xh', max: 'x' }
    };
  })();
  assert.deepEqual(resolved.kinds.hardest, { model: 'big', effort: 'xh' });
  assert.deepEqual(resolved.kinds.lookup, { model: 'small', effort: null });
});

test('a tier on inherit, a kind on xhigh and a listed model no tier uses all load', () => {
  const loaded = readTableWith((copy) => {
    copy.providers.claude.tiers.fast = 'inherit';
    copy.kinds.build.effort = 'xhigh';
  })();
  assert.deepEqual(loaded.kinds.lookup, { model: 'inherit', effort: null });
  assert.deepEqual(loaded.kinds.build, { model: 'sonnet', effort: 'xhigh' });
  assert.ok(!Object.values(table.providers.claude.tiers).includes('fable'));
  assert.ok(table.providers.claude.models.includes('fable'));
});

test('the reader rejects an unknown provider, tier, effort, kind or skill field, and an unmapped tier or effort', () => {
  assert.throws(readTableWith((copy) => { copy.provider = 'gpt'; }), /unknown provider gpt/);
  assert.throws(readTableWith((copy) => { delete copy.providers.claude.tiers.fast; }), /provider claude: no model for tier fast/);
  assert.throws(readTableWith((copy) => { delete copy.providers.claude.efforts.max; }), /provider claude: no value for effort max/);
  assert.throws(readTableWith((copy) => { copy.providers.claude.tiers.fast = 'mini'; }), /tier fast names mini, which models does not list/);
  assert.throws(readTableWith((copy) => { delete copy.providers.claude.models; }), /tier strong names opus, which models does not list/);
  assert.throws(readTableWith((copy) => { delete copy.providers.claude.efforts.xhigh; }), /no value for effort xhigh/);
  assert.throws(readTableWith((copy) => { copy.kinds.build.tier = 'huge'; }), /kind build: unknown tier huge/);
  assert.throws(readTableWith((copy) => { copy.kinds.build.effort = 'huge'; }), /kind build: unknown effort huge/);
  assert.throws(readTableWith((copy) => { copy.agents['agents/build-ui.md'].kind = 'nope'; }), /agents\/build-ui\.md: unknown kind nope/);
  assert.throws(readTableWith((copy) => { copy.dispatches[0].kind = 'nope'; }), /unknown kind nope/);
  assert.throws(readTableWith((copy) => { copy.stages.build.kind = 'nope'; }), /stage build: unknown kind nope/);
  assert.throws(readTableWith((copy) => { copy.skills['skills/verify/SKILL.md'].fields = ['tools']; }), /unknown field tools/);
});

test('every agent file has exactly one entry, and each entry names a file or its source', () => {
  const agentFiles = fs.readdirSync(path.join(ROOT, 'agents')).map((name) => `agents/${name}`);
  for (const file of agentFiles) {
    assert.ok(file in table.agents, `${file} has no kind`);
  }
  for (const [file, entry] of Object.entries(table.agents)) {
    const source = entry.generatedFrom ?? file;
    assert.ok(fs.existsSync(path.join(ROOT, source)), `${file}: ${source} is missing`);
  }
});

test('every skill entry holds the kind values in the fields it lists', () => {
  for (const [file, entry] of Object.entries(table.skills)) {
    const kind = table.kinds[entry.kind];
    for (const field of entry.fields) {
      assert.equal(frontmatterField(file, field), kind[field], `${file} ${field}`);
    }
  }
});

test('every dispatch match is one line holding one model word, the kind\'s', () => {
  for (const { file, match, kind } of table.dispatches) {
    const lines = readRepoFile(file).split('\n').filter((line) => line.includes(match));
    assert.equal(lines.length, 1, `${file}: "${match}" matches ${lines.length} lines`);
    const words = [...lines[0].matchAll(MODEL_WORD)].map((found) => found[1]);
    assert.deepEqual(words, [table.kinds[kind].model], `${file}: "${match}"`);
  }
});

test('every next-stage line prints the model and effort of the kind the table gives its stage', async () => {
  const { nextStageReport } = await import('../skills/route-skills/scripts/next-stage.mjs');
  const { fixture, planFixture, taskSection } = await import('./harness.mjs');
  const directory = await fixture();
  const planPath = path.join(directory, 'plan.md');
  const task = taskSection({ number: 1, title: 'Greet', files: ['- Modify: `src/app.js` (`greet`)'], subject: 'feat(app): greet' });
  fs.writeFileSync(planPath, planFixture({ tasks: [task] }));
  for (const [after, stage] of [['find-cause', 'build-no-spec'], ['spec', 'build']]) {
    const { model, effort } = table.kinds[table.stages[stage].kind];
    const report = nextStageReport({ after, artifact: planPath });
    assert.ok(report.includes(`Next stage runs on \`${model}\` at \`${effort}\``), `${stage}: ${report}`);
  }
});

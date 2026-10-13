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

function readTableWith(change) {
  const copy = JSON.parse(fs.readFileSync(TABLE_PATH, 'utf8'));
  change(copy);
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'kinds-')), 'table.json');
  fs.writeFileSync(file, JSON.stringify(copy));
  return () => readKindTable(file);
}

test('every kind resolves through the claude block to a model and an effort or null', () => {
  assert.deepEqual(Object.keys(table.kinds).sort(), [
    'build', 'build-task', 'chore', 'coordinate', 'handover', 'hardest', 'investigate',
    'lookup', 'peer', 'peer-review', 'prose', 'research', 'review', 'review-deep'
  ]);
  assert.deepEqual(table.kinds.hardest, { model: 'opus', effort: 'high' });
  assert.deepEqual(table.kinds.build, { model: 'sonnet', effort: 'high' });
  assert.deepEqual(table.kinds.lookup, { model: 'haiku', effort: 'low' });
  assert.deepEqual(table.kinds.peer, { model: 'inherit', effort: 'high' });
  assert.deepEqual(table.kinds.handover, { model: 'inherit', effort: null });
});

test('the raw table names a tier and a neutral effort per kind, and the claude block maps them', () => {
  const raw = JSON.parse(fs.readFileSync(TABLE_PATH, 'utf8'));
  assert.equal(raw.provider, 'claude');
  assert.deepEqual(raw.providers.claude.tiers, { strong: 'opus', standard: 'sonnet', fast: 'haiku' });
  assert.deepEqual(raw.providers.claude.models, ['fable', 'opus', 'sonnet', 'haiku']);
  assert.deepEqual(Object.keys(raw.providers.claude.efforts), ['low', 'medium', 'high', 'xhigh', 'max']);
  assert.deepEqual(raw.kinds.hardest, {
    fast: { tier: 'strong', effort: 'medium' },
    balanced: { tier: 'strong', effort: 'high' },
    quality: { tier: 'strong', effort: 'xhigh' }
  });
  assert.deepEqual(raw.kinds.handover.quality, { tier: 'inherit', effort: null });
  assert.equal(raw.budgets, undefined);
  assert.equal(raw.skills, undefined);
});

test('the budget picks the column a kind resolves from, and balanced is the default', () => {
  assert.deepEqual(readKindTable(TABLE_PATH, { budget: 'fast' }).kinds.build, { model: 'sonnet', effort: 'medium' });
  assert.deepEqual(readKindTable(TABLE_PATH, { budget: 'quality' }).kinds.build, { model: 'opus', effort: 'medium' });
  assert.deepEqual(readKindTable(TABLE_PATH, { budget: 'quality' }).kinds.hardest, { model: 'opus', effort: 'xhigh' });
  assert.deepEqual(readKindTable(TABLE_PATH, { budget: 'balanced' }).kinds, table.kinds);
  assert.throws(() => readKindTable(TABLE_PATH, { budget: 'off' }), /unknown budget off/);
  assert.throws(() => readKindTable(TABLE_PATH, { budget: 'high' }), /unknown budget high/);
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
  assert.deepEqual(resolved.kinds.hardest, { model: 'big', effort: 'h' });
  assert.deepEqual(resolved.kinds.lookup, { model: 'small', effort: 'l' });
});

test('a tier on inherit, a kind on xhigh and a listed model no tier uses all load', () => {
  const loaded = readTableWith((copy) => {
    copy.providers.claude.tiers.fast = 'inherit';
    copy.kinds.build.balanced.effort = 'xhigh';
  })();
  assert.deepEqual(loaded.kinds.lookup, { model: 'inherit', effort: 'low' });
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
  assert.throws(readTableWith((copy) => { copy.kinds.build.balanced.tier = 'huge'; }), /kind build: unknown tier huge/);
  assert.throws(readTableWith((copy) => { copy.kinds.build.quality.effort = 'huge'; }), /kind build: unknown effort huge/);
  assert.throws(readTableWith((copy) => { delete copy.kinds.build.fast; }), /kind build: no fast column/);
  assert.throws(readTableWith((copy) => { copy.agents['agents/build-ui.md'].kind = 'nope'; }), /agents\/build-ui\.md: unknown kind nope/);
  assert.throws(readTableWith((copy) => { copy.dispatches[0].kind = 'nope'; }), /unknown kind nope/);
  assert.throws(readTableWith((copy) => { copy.stages.build.kind = 'nope'; }), /stage build: unknown kind nope/);
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

test('every dispatch match is one line that names its kind tag and no model word', () => {
  for (const { file, match, kind } of table.dispatches) {
    const lines = readRepoFile(file).split('\n').filter((line) => line.includes(match));
    assert.equal(lines.length, 1, `${file}: "${match}" matches ${lines.length} lines`);
    assert.ok(lines[0].includes(`exo-kind: ${kind}`), `${file}: "${match}" lacks the ${kind} tag`);
    assert.deepEqual([...lines[0].matchAll(MODEL_WORD)], [], `${file}: "${match}"`);
  }
});

test('the fresh-chat route names the model of the kind the table gives the build stage', async () => {
  const { freshReport } = await import('../skills/route-skills/scripts/next-stage.mjs');
  const { fixture, planFixture, taskSection } = await import('./harness.mjs');
  const directory = await fixture();
  const planPath = path.join(directory, 'plan.md');
  const task = taskSection({ number: 1, title: 'Greet', files: ['- Modify: `src/app.js` (`greet`)'], subject: 'feat(app): greet' });
  fs.writeFileSync(planPath, planFixture({ tasks: [task] }));
  const { model } = table.kinds[table.stages.build.kind];
  const report = freshReport({ after: 'spec', artifact: planPath });
  assert.ok(report.includes(`\`/model ${model}\``), report);
});

test('the codex block lists its models, tiers, identity efforts, shift, null effort and twins', () => {
  const { codex } = JSON.parse(fs.readFileSync(TABLE_PATH, 'utf8')).providers;
  assert.deepEqual(codex.models, ['gpt-6.1-sol', 'gpt-6-luna']);
  assert.deepEqual(codex.tiers, { strong: 'gpt-6.1-sol', standard: 'gpt-6.1-sol', fast: 'gpt-6-luna' });
  assert.deepEqual(codex.efforts, { low: 'low', medium: 'medium', high: 'high', xhigh: 'xhigh', max: 'max' });
  assert.deepEqual(codex.effortShift, { strong: 1 });
  assert.equal(codex.nullEffort, 'medium');
  assert.equal(codex.codexTwins, undefined);
});

test('the budget twin agent files are folded into their base agents', () => {
  for (const twin of ['critique-ui-high', 'review-branch-deep', 'review-branch-deep-high', 'solve-hard-high', 'solve-hard-low']) {
    assert.ok(!(`agents/${twin}.md` in table.agents), `agents/${twin}.md is still an agents entry`);
  }
  for (const kind of ['review-deep-high', 'hardest-high', 'hardest-low']) assert.ok(!(kind in table.kinds), `kind ${kind} is gone`);
});

test('the default provider stays claude', () => {
  assert.equal(readKindTable().provider, 'claude');
  assert.deepEqual(readKindTable(TABLE_PATH, { provider: 'claude' }).kinds, table.kinds);
});

test('the codex provider shifts a strong kind up one effort step, clamped at max, and gives a null effort medium', () => {
  const codex = readKindTable(TABLE_PATH, { provider: 'codex' });
  assert.equal(codex.provider, 'codex');
  assert.deepEqual(codex.kinds.build, { model: 'gpt-6.1-sol', effort: 'high' });
  assert.deepEqual(codex.kinds.research, { model: 'gpt-6.1-sol', effort: 'low' });
  assert.deepEqual(codex.kinds.lookup, { model: 'gpt-6-luna', effort: 'low' });
  const nulled = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'kinds-')), 'table.json');
  const raw = JSON.parse(fs.readFileSync(TABLE_PATH, 'utf8'));
  raw.kinds.lookup.balanced.effort = null;
  fs.writeFileSync(nulled, JSON.stringify(raw));
  assert.equal(readKindTable(nulled, { provider: 'codex' }).kinds.lookup.effort, 'medium');
  assert.deepEqual(codex.kinds['review-deep'], { model: 'gpt-6.1-sol', effort: 'high' });
  assert.deepEqual(codex.kinds.hardest, { model: 'gpt-6.1-sol', effort: 'xhigh' });
  assert.deepEqual(codex.kinds.handover, { model: 'inherit', effort: null });
  assert.equal(codex.kinds.prose.effort, 'high');
});

test('a strong kind at max stays at max under the codex shift', () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'kinds-')), 'table.json');
  const copy = JSON.parse(fs.readFileSync(TABLE_PATH, 'utf8'));
  copy.kinds.hardest.balanced.effort = 'max';
  fs.writeFileSync(file, JSON.stringify(copy));
  assert.equal(readKindTable(file, { provider: 'codex' }).kinds.hardest.effort, 'max');
});

test('the reader rejects a bad codex shift or null effort', () => {
  const codex = (change) => () => {
    const read = readTableWith((copy) => { copy.provider = 'codex'; change(copy.providers.codex); });
    return read();
  };
  assert.throws(readKindTable.bind(null, TABLE_PATH, { provider: 'nope' }), /unknown provider nope/);
  assert.throws(codex((block) => { block.effortShift = { strong: 1, huge: 1 }; }), /effortShift names unknown tier huge/);
  assert.throws(codex((block) => { block.nullEffort = 'huge'; }), /nullEffort names unknown effort huge/);
});

const BUILDER_KINDS = ['build', 'build-task', 'coordinate'];
const BUILDER_AGENTS = ['agents/build-task.md', 'agents/build-ui.md', 'agents/fix-review.md', 'agents/run-unit.md'];

test('every builder agent is on a builder kind, and no builder kind resolves to the strong tier', () => {
  for (const file of BUILDER_AGENTS) {
    assert.ok(BUILDER_KINDS.includes(table.agents[file].kind), `${file} is on kind ${table.agents[file].kind}`);
  }
  const { strong } = table.providers[table.provider].tiers;
  for (const kind of BUILDER_KINDS) {
    assert.notEqual(table.kinds[kind].model, strong, `kind ${kind} resolves to the strong tier ${strong}`);
  }
});

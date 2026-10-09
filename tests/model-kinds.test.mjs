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
    'build', 'build-task', 'chore', 'coordinate', 'handover', 'hardest', 'hardest-high', 'hardest-low', 'investigate',
    'lookup', 'prose', 'research', 'review', 'review-deep', 'review-deep-high'
  ]);
  assert.deepEqual(table.kinds.hardest, { model: 'opus', effort: 'high' });
  assert.deepEqual(table.kinds['hardest-high'], { model: 'opus', effort: 'xhigh' });
  assert.deepEqual(table.kinds['hardest-low'], { model: 'opus', effort: 'medium' });
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
  assert.deepEqual(raw.kinds.hardest, { tier: 'strong', effort: 'high' });
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
  assert.deepEqual(resolved.kinds.hardest, { model: 'big', effort: 'h' });
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
  assert.equal(codex.lowTwins, undefined);
  assert.deepEqual(Object.fromEntries(Object.entries(codex.codexTwins).map(([name, twin]) => [name, [twin.from, twin.kind, twin.budget ?? null]])), {
    'exo-critique-ui-high': ['agents/critique-ui.md', 'review-deep-high', null],
    'exo-critique-ui-low': ['agents/critique-ui.md', 'review-deep', 'low'],
    'exo-review-branch-deep': ['agents/review-branch.md', 'review-deep', null],
    'exo-review-branch-deep-high': ['agents/review-branch.md', 'review-deep-high', null],
    'exo-review-branch-deep-low': ['agents/review-branch.md', 'review-deep', 'low'],
    'exo-solve-hard-high': ['agents/solve-hard.md', 'hardest-high', null],
    'exo-solve-hard-low': ['agents/solve-hard.md', 'hardest-low', null]
  });
});

test('the budget twin agent files are folded into their base agents', () => {
  for (const twin of ['critique-ui-high', 'review-branch-deep', 'review-branch-deep-high', 'solve-hard-high', 'solve-hard-low']) {
    assert.ok(!(`agents/${twin}.md` in table.agents), `agents/${twin}.md is still an agents entry`);
  }
  for (const kind of ['review-deep-high', 'hardest-high', 'hardest-low']) assert.ok(kind in table.kinds, `kind ${kind} is kept for the budget call mapping`);
});

test('the default provider stays claude and carries no codex twins', () => {
  assert.equal(readKindTable().provider, 'claude');
  assert.deepEqual(readKindTable().codexTwins, {});
  assert.deepEqual(readKindTable(TABLE_PATH, { provider: 'claude' }).kinds, table.kinds);
});

test('the codex provider shifts a strong kind up one effort step, clamped at max, and gives a null effort medium', () => {
  const codex = readKindTable(TABLE_PATH, { provider: 'codex' });
  assert.equal(codex.provider, 'codex');
  assert.deepEqual(codex.kinds.build, { model: 'gpt-6.1-sol', effort: 'high' });
  assert.deepEqual(codex.kinds.research, { model: 'gpt-6.1-sol', effort: 'medium' });
  assert.deepEqual(codex.kinds.lookup, { model: 'gpt-6-luna', effort: 'medium' });
  assert.deepEqual(codex.kinds['review-deep'], { model: 'gpt-6.1-sol', effort: 'xhigh' });
  assert.deepEqual(codex.kinds['review-deep-high'], { model: 'gpt-6.1-sol', effort: 'max' });
  assert.deepEqual(codex.kinds['hardest-low'], { model: 'gpt-6.1-sol', effort: 'high' });
  assert.deepEqual(codex.kinds.handover, { model: 'inherit', effort: null });
  assert.equal(codex.kinds.prose.effort, 'xhigh');
});

test('a strong kind at max stays at max under the codex shift', () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'kinds-')), 'table.json');
  const copy = JSON.parse(fs.readFileSync(TABLE_PATH, 'utf8'));
  copy.kinds.prose.effort = 'max';
  fs.writeFileSync(file, JSON.stringify(copy));
  assert.equal(readKindTable(file, { provider: 'codex' }).kinds.prose.effort, 'max');
});

test('each codex twin resolves its kind, and a budget twin at that budget\'s tier swap without the effort shift', () => {
  const { codexTwins } = readKindTable(TABLE_PATH, { provider: 'codex' });
  const resolved = Object.fromEntries(Object.entries(codexTwins).map(([name, twin]) => [name, `${twin.model}:${twin.effort}`]));
  assert.deepEqual(resolved, {
    'exo-critique-ui-high': 'gpt-6.1-sol:max',
    'exo-critique-ui-low': 'gpt-6.1-sol:high',
    'exo-review-branch-deep': 'gpt-6.1-sol:xhigh',
    'exo-review-branch-deep-high': 'gpt-6.1-sol:max',
    'exo-review-branch-deep-low': 'gpt-6.1-sol:high',
    'exo-solve-hard-high': 'gpt-6.1-sol:max',
    'exo-solve-hard-low': 'gpt-6.1-sol:high'
  });
  assert.equal(codexTwins['exo-review-branch-deep'].from, 'agents/review-branch.md');
  assert.equal(codexTwins['exo-review-branch-deep'].description, 'Reviews one risky plan branch. Dispatched by verify only.');
});

test('the reader rejects a bad codex shift, null effort or low twin', () => {
  const codex = (change) => () => {
    const read = readTableWith((copy) => { copy.provider = 'codex'; change(copy.providers.codex); });
    return read();
  };
  assert.throws(readKindTable.bind(null, TABLE_PATH, { provider: 'nope' }), /unknown provider nope/);
  assert.throws(codex((block) => { block.effortShift = { strong: 1, huge: 1 }; }), /effortShift names unknown tier huge/);
  assert.throws(codex((block) => { block.nullEffort = 'huge'; }), /nullEffort names unknown effort huge/);
  assert.throws(codex((block) => { block.codexTwins['exo-nope-low'] = { from: 'agents/nope.md', kind: 'build', description: 'x' }; }), /codexTwins exo-nope-low names agents\/nope\.md, which agents does not list/);
  assert.throws(codex((block) => { block.codexTwins['exo-nope-low'] = { from: 'agents/build-task.md', kind: 'nope', description: 'x' }; }), /codexTwins exo-nope-low: unknown kind nope/);
  assert.throws(codex((block) => { block.codexTwins['exo-build-task-low'] = { from: 'agents/build-task.md', kind: 'build', budget: 'low', description: 'x' }; }), /exo-build-task-low: kind build is not on a tier the low budget swaps/);
});

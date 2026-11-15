import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { chooseProvider } from '../skills/build/scripts/run-plan-provider.mjs';
import { childEnv } from '../skills/build/scripts/run-session-env.mjs';
import { contextLimit, softLimit } from '../lib/context-limits.mjs';
import { INHERIT, readKindTable } from '../lib/model-kinds.mjs';
import { tempDir } from './harness.mjs';

const cell = (kind, retry) => {
  const { model, effort } = readKindTable(undefined, { budget: 'on', retry }).kinds[kind];
  return { model: model === INHERIT ? null : model, effort };
};

function pinsWith(budget, flags) {
  const home = tempDir('exo-plan-home-');
  fs.mkdirSync(path.join(home, '.config', 'exo'), { recursive: true });
  fs.writeFileSync(path.join(home, '.config', 'exo', 'keys.env'), 'DEEPSEEK_API_KEY=x\nZAI_API_KEY=x\n');
  const project = tempDir('exo-plan-project-');
  fs.mkdirSync(path.join(project, '.claude'), { recursive: true });
  fs.writeFileSync(path.join(project, '.claude', 'exo.json'), JSON.stringify({ budget }));
  const saved = process.env.CLAUDE_PROJECT_DIR;
  process.env.CLAUDE_PROJECT_DIR = project;
  try {
    return chooseProvider(flags, home, { root: home, planFiles: [] });
  } finally {
    if (saved === undefined) delete process.env.CLAUDE_PROJECT_DIR;
    else process.env.CLAUDE_PROJECT_DIR = saved;
  }
}

const modelAndEffort = ({ model, effort }) => ({ model, effort });

test('the budget pins read the on cell, and the retry cell on a retry', () => {
  const chosen = pinsWith('on', { provider: 'claude' });
  assert.deepEqual(modelAndEffort(chosen), cell('builder', false));
  assert.deepEqual(chosen.docPin, cell('doc-task', false));
  assert.deepEqual(chosen.retryPin, cell('builder', true));
  assert.deepEqual(chosen.docRetryPin, cell('doc-task', true));
  for (const kind of ['builder', 'doc-task']) assert.notDeepEqual(cell(kind, true), cell(kind, false));
});

test('budget off and an explicit flag pin nothing on a retry', () => {
  assert.deepEqual(pinsWith('off', { provider: 'claude' }).retryPin, { model: null, effort: null });
  assert.deepEqual(pinsWith('on', { provider: 'claude', model: 'x' }).retryPin, {});
});

test('a listed non-claude provider pins only the kind effort, an unlisted one pins nothing', () => {
  const listed = pinsWith('on', { provider: 'deepseek' });
  assert.equal(listed.effort, 'low');
  assert.deepEqual(listed.docPin, { effort: 'low' });
  assert.deepEqual(listed.retryPin, { effort: 'high' });
  assert.deepEqual(pinsWith('off', { provider: 'deepseek' }).retryPin, { model: null, effort: null });
  const unlisted = pinsWith('on', { provider: 'zai' });
  assert.deepEqual(unlisted.docPin, {});
  assert.deepEqual(unlisted.retryPin, {});
  assert.deepEqual(pinsWith('off', { provider: 'zai' }).retryPin, {});
});

test('chooseProvider takes the caller effort before the config default', () => {
  const home = tempDir('exo-plan-home-');
  fs.mkdirSync(path.join(home, '.config', 'exo'), { recursive: true });
  fs.writeFileSync(path.join(home, '.config', 'exo', 'keys.env'), 'DEEPSEEK_API_KEY=x\n');
  assert.equal(chooseProvider({ provider: 'deepseek' }, home, { root: home, planFiles: [] }).asked, 'medium');
  assert.equal(chooseProvider({ provider: 'deepseek', effort: 'high' }, home, { root: home, planFiles: [] }).asked, 'high');
});

test('an explicit effort reaches the session env, a default or a bare model does not', () => {
  const home = tempDir('exo-plan-home-');
  fs.mkdirSync(path.join(home, '.config', 'exo'), { recursive: true });
  fs.writeFileSync(path.join(home, '.config', 'exo', 'keys.env'), 'DEEPSEEK_API_KEY=x\n');
  const medium = childEnv(null, chooseProvider({ provider: 'deepseek', effort: 'medium' }, home, { root: home, planFiles: [] }), { handoff: null, ecosystemEnv: {}, repair: false, refuseCommits: null });
  assert.equal(medium.CLAUDE_CODE_EFFORT_LEVEL, 'high');
  const none = childEnv(null, chooseProvider({ provider: 'deepseek' }, home, { root: home, planFiles: [] }), { handoff: null, ecosystemEnv: {}, repair: false, refuseCommits: null });
  assert.equal(none.CLAUDE_CODE_EFFORT_LEVEL, undefined);
  const model = childEnv(null, chooseProvider({ provider: 'deepseek', model: 'deepseek-flash' }, home, { root: home, planFiles: [] }), { handoff: null, ecosystemEnv: {}, repair: false, refuseCommits: null });
  assert.equal(model.CLAUDE_CODE_EFFORT_LEVEL, undefined);
});

test('the run plan budgets the soft limit and follows a run.json contextLimit', () => {
  const home = tempDir('exo-plan-home-');
  assert.equal(chooseProvider({}, home, { root: home, planFiles: [] }).contextBudget, softLimit(contextLimit(home)));
  fs.mkdirSync(path.join(home, '.config', 'exo'), { recursive: true });
  fs.writeFileSync(path.join(home, '.config', 'exo', 'run.json'), '{"defaults":{"contextLimit":200000}}');
  assert.equal(chooseProvider({}, home, { root: home, planFiles: [] }).contextBudget, 150_000);
});

test('a failed attempt is a ledger round of kind attempt with its cost', async () => {
  const { settleAttempt } = await import('../skills/build/scripts/run-plan-attempts.mjs');
  const { report } = await import('../lib/loop-budget.mjs');
  const { ledgerDirOf } = await import('../skills/build/scripts/run-state.mjs');
  const root = tempDir('exo-attempt-root-');
  const ctx = { root, planPath: path.join(root, 'plan.md'), plan: { tasks: [{}, {}] }, run: { landings: new Map() }, spent: 0.5, failedAttempts: 1 };
  const settled = settleAttempt(ctx, { wallMs: 10 });
  assert.equal(report(ledgerDirOf(root, ctx.planPath)), ['kind\trounds\twall_ms\tcost_usd', ['attempt', 1, 10, 0.5].join('\t')].join('\n'));
  assert.equal(settled.stop, false);
});

test('a second failed attempt that lands nothing stops as no-progress', async () => {
  const { settleAttempt } = await import('../skills/build/scripts/run-plan-attempts.mjs');
  const root = tempDir('exo-attempt-stall-');
  const ctx = { root, planPath: path.join(root, 'plan.md'), plan: { tasks: [{}, {}] }, run: { landings: new Map() }, spent: 0, failedAttempts: 1 };
  assert.equal(settleAttempt(ctx, { wallMs: 1 }).stop, false);
  const second = settleAttempt(ctx, { wallMs: 1 });
  assert.equal(second.stop, true);
  assert.equal(second.reason, 'last round made no progress');
});

test('an attempt after a landing counts as progress', async () => {
  const { settleAttempt } = await import('../skills/build/scripts/run-plan-attempts.mjs');
  const root = tempDir('exo-attempt-progress-');
  const ctx = { root, planPath: path.join(root, 'plan.md'), plan: { tasks: [{}, {}, {}] }, run: { landings: new Map() }, spent: 0, failedAttempts: 1 };
  settleAttempt(ctx, { wallMs: 1 });
  ctx.run.landings.set(1, {});
  assert.equal(settleAttempt(ctx, { wallMs: 1 }).stop, false);
});

test('a free try spends no attempt round', async () => {
  const source = fs.readFileSync(new URL('../skills/build/scripts/run-plan-build.mjs', import.meta.url), 'utf8');
  assert.match(source, /if \(freeTry\) return undefined;\s+return attemptLimitStop/);
});

test('the max-turns path imports shelvePartialWork', () => {
  const source = fs.readFileSync(new URL('../skills/build/scripts/run-plan-build.mjs', import.meta.url), 'utf8');
  assert.match(source, /import \{[^}]*\bshelvePartialWork\b[^}]*\} from '\.\/run-plan-stops\.mjs'/);
});

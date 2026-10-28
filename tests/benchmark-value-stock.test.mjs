import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { parseArguments } from '../benchmarks/run-args.mjs';
import { loadValueTasks } from '../benchmarks/value.mjs';
import { VALUE_QUICK_TASKS } from '../benchmarks/tasks.mjs';
import { mergeStock, quickStock, quickSummary, readStock, stockRows, stockStorePath, writeStock } from '../benchmarks/value-stock.mjs';

const cell = (task, pass, cost) => ({ task, pass, cost_usd: cost, wallMs: 1000 });

test('VALUE_QUICK_TASKS names three existing value tasks', () => {
  const ids = loadValueTasks().map((task) => task.id);
  assert.equal(VALUE_QUICK_TASKS.length, 3);
  for (const id of VALUE_QUICK_TASKS) assert.ok(ids.includes(id), `${id} is not a value task`);
});

test('--stock-baseline runs the baseline arm three times on each quick task with sonnet', () => {
  const options = parseArguments(['--stock-baseline']);
  assert.equal(options.stockBaseline, true);
  assert.deepEqual(options.tasks, VALUE_QUICK_TASKS);
  assert.deepEqual(options.arms, ['baseline']);
  assert.equal(options.runs, 3);
  assert.equal(options.model, 'sonnet');
  assert.equal(parseArguments(['--smoke']).stockBaseline, false);
});

test('stockRows groups cells into one row per task keyed by model and claude version', () => {
  const rows = stockRows({ cells: [cell('a', true, 0.1), cell('a', false, 0.2), cell('b', true, 0.3)], model: 'claude-sonnet-5-5', claudeVersion: '2.1.9' });
  assert.deepEqual(rows, [
    { task: 'a', model: 'claude-sonnet-5-5', claudeVersion: '2.1.9', runs: [{ pass: true, cost_usd: 0.1, wallMs: 1000 }, { pass: false, cost_usd: 0.2, wallMs: 1000 }] },
    { task: 'b', model: 'claude-sonnet-5-5', claudeVersion: '2.1.9', runs: [{ pass: true, cost_usd: 0.3, wallMs: 1000 }] }
  ]);
});

test('stockRows refuses a cell without a verdict or a cost', () => {
  const rows = (cells) => () => stockRows({ cells, model: 'm', claudeVersion: 'v' });
  assert.throws(rows([cell('a', undefined, 0.1)]), /a has a cell without a pass verdict/);
  assert.throws(rows([cell('a', true, undefined)]), /a has a cell without a pass verdict/);
});

test('mergeStock replaces rows of the same task and model and keeps the rest', () => {
  const old = [{ task: 'a', model: 'm', claudeVersion: '1', runs: [] }, { task: 'b', model: 'm', claudeVersion: '1', runs: [] }, { task: 'a', model: 'other', claudeVersion: '1', runs: [] }];
  const fresh = [{ task: 'a', model: 'm', claudeVersion: '2', runs: [] }];
  assert.deepEqual(mergeStock(old, fresh).map((row) => `${row.task}/${row.model}/${row.claudeVersion}`), ['b/m/1', 'a/other/1', 'a/m/2']);
});

test('writeStock creates the store and readStock reads it back', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-stock-'));
  try {
    const file = path.join(directory, 'exo', 'value', 'stock.json');
    assert.deepEqual(readStock(file), []);
    const rows = stockRows({ cells: [cell('a', true, 0.1)], model: 'm', claudeVersion: 'v' });
    writeStock(file, rows);
    assert.deepEqual(readStock(file), rows);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('stockStorePath sits in the git common directory under exo/value', () => {
  const file = stockStorePath();
  assert.ok(path.isAbsolute(file));
  assert.ok(file.endsWith(path.join('exo', 'value', 'stock.json')));
});

const stockRow = ({ task, model, claudeVersion, runs }) => ({ task, model, claudeVersion, runs });

test('quickStock refuses a missing task or model with a message naming --stock-baseline', () => {
  const rows = [stockRow({ task: 'a', model: 'm', claudeVersion: 'v', runs: [] })];
  assert.throws(() => quickStock({ rows, tasks: ['a', 'b'], model: 'm', claudeVersion: 'v' }), /no stock arm stored for b on m.*--stock-baseline/);
  assert.throws(() => quickStock({ rows, tasks: ['a'], model: 'other', claudeVersion: 'v' }), /no stock arm stored for a on other.*--stock-baseline/);
});

test('quickStock keeps the rows of the model and warns when the claude version differs', () => {
  const rows = [stockRow({ task: 'a', model: 'm', claudeVersion: '1', runs: [] }), stockRow({ task: 'a', model: 'other', claudeVersion: '1', runs: [] })];
  assert.equal(quickStock({ rows, tasks: ['a'], model: 'm', claudeVersion: '1' }).warning, null);
  const stale = quickStock({ rows, tasks: ['a'], model: 'm', claudeVersion: '2' });
  assert.deepEqual(stale.stock, [rows[0]]);
  assert.match(stale.warning, /stored on claude 1, this run uses 2/);
});

test('quickSummary reports mode, cost, duration and per-task pass and cost deltas against the stock mean', () => {
  const stock = [stockRow({ task: 'a', model: 'm', claudeVersion: 'v', runs: [{ pass: true, cost_usd: 0.1 }, { pass: false, cost_usd: 0.3 }] }), stockRow({ task: 'b', model: 'm', claudeVersion: 'v', runs: [{ pass: true, cost_usd: 0.2 }] })];
  const summary = quickSummary({ stock, cells: [cell('a', true, 0.5)], durationMs: 4200 });
  assert.equal(summary.mode, 'quick');
  assert.equal(summary.cost_usd, 0.5);
  assert.equal(summary.durationMs, 4200);
  assert.equal(summary.tasks.length, 1);
  const [task] = summary.tasks;
  assert.deepEqual([task.task, task.exoPass, task.stockPass, task.passDelta, task.exoCost], ['a', 1, 0.5, 0.5, 0.5]);
  assert.ok(Math.abs(task.stockCost - 0.2) < 1e-9);
  assert.ok(Math.abs(task.costDelta - 0.3) < 1e-9);
});

test('quickSummary leaves the cost delta null for a cell without a reported cost', () => {
  const stock = [stockRow({ task: 'a', model: 'm', claudeVersion: 'v', runs: [{ pass: true, cost_usd: 0.1 }] })];
  const summary = quickSummary({ stock, cells: [{ task: 'a', pass: false, cost_usd: undefined, wallMs: 1 }], durationMs: 1 });
  assert.equal(summary.cost_usd, 0);
  assert.equal(summary.tasks[0].costDelta, null);
  assert.equal(summary.tasks[0].passDelta, -1);
});

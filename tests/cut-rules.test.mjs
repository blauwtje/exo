// The session hook injects only the cut route-skills rules that the pressure
// run of benchmarks/results/2026-10-08-cut-rules.md proved needed: a rule the
// main arm failed and the plugin-dir arm passed is a `restore` row, and
// hooks/session-rules.md holds exactly those rules, or is absent when no row
// restores.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';

const RESULTS = new URL('../benchmarks/results/2026-10-08-cut-rules.md', import.meta.url);
const SESSION_RULES = new URL('../hooks/session-rules.md', import.meta.url);
const VERDICTS = new Set(['restore', 'drop', 'hardened']);
const ROW = /^\| *(\d+) *\| *(\w+) *\| *(.+?) *\| *(pass|fail) *\| *(pass|fail) *\|(.+)\|$/gm;
const COST = /`total (main|with): \$\d+(?:\.\d+)?`/g;

function resultRows() {
  const source = fs.readFileSync(RESULTS, 'utf8');
  return [...source.matchAll(ROW)].map(([, rule, verdict, text, main, withRules, costs]) => ({
    rule: Number(rule),
    verdict,
    text,
    main,
    withRules,
    costs: [...costs.matchAll(COST)].map((match) => match[1]),
  }));
}

function sessionRules() {
  if (!fs.existsSync(SESSION_RULES)) return null;
  const source = fs.readFileSync(SESSION_RULES, 'utf8');
  return [...source.matchAll(/^- (.+)$/gm)].map((match) => match[1]);
}

test('the results file holds one row per cut rule, each with both arm costs', () => {
  const rows = resultRows();
  assert.deepEqual(rows.map((row) => row.rule), [1, 2, 3, 4, 5, 6]);
  for (const row of rows) {
    assert.ok(VERDICTS.has(row.verdict), `rule ${row.rule}: unknown verdict ${row.verdict}`);
    assert.deepEqual([...new Set(row.costs)].sort(), ['main', 'with'], `rule ${row.rule}: needs both total cost lines`);
  }
});

test('each verdict follows from its two arms', () => {
  for (const row of resultRows()) {
    if (row.verdict === 'restore') assert.deepEqual([row.main, row.withRules], ['fail', 'pass'], `rule ${row.rule}`);
    if (row.verdict === 'hardened') assert.deepEqual([row.main, row.withRules], ['pass', 'pass'], `rule ${row.rule}`);
  }
});

test('hooks/session-rules.md holds exactly the restore rows, or is absent without one', () => {
  const restored = resultRows().filter((row) => row.verdict === 'restore').map((row) => row.text);
  const injected = sessionRules();
  if (restored.length === 0) {
    assert.equal(injected, null, 'hooks/session-rules.md exists though no rule restores');
    return;
  }
  assert.deepEqual(injected, restored);
});

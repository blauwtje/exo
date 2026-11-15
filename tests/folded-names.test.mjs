import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { checkFoldedNames } from '../verify/checks/folded-names.mjs';

const MAP = {
  skills: {
    research: { owner: 'spec', state: 'pending' },
    ideate: { owner: 'spec', state: 'folded' },
  },
  agents: { locator: { owner: 'worker', state: 'folded' } },
};

function verdict(root) {
  const results = [];
  const report = { result: (status, name, detail) => results.push({ status, detail }), assert: (ok, name, text) => results.push({ status: ok ? 'PASS' : 'FAIL', detail: ok ? text.pass : text.fail }) };
  checkFoldedNames(report, { root });
  return results[0];
}

function fixture(files, map = MAP) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'folded-names-'));
  const all = { 'verify/fold-map.json': JSON.stringify(map), ...files };
  for (const [name, text] of Object.entries(all)) {
    fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    fs.writeFileSync(path.join(root, name), text);
  }
  spawnSync('git', ['init', '-q'], { cwd: root });
  spawnSync('git', ['add', '-A'], { cwd: root });
  return root;
}

test('a folded skill name in a file is a hit', () => {
  const root = fixture({ 'docs/a.md': 'run exo:ideate now\n' });
  const { status, detail } = verdict(root);
  assert.equal(status, 'FAIL');
  assert.match(detail, /found: docs\/a\.md:1: run exo:ideate now$/);
});

test('a folded skill path, an agent name and MODE.md are hits', () => {
  const root = fixture({
    'a.md': 'see skills/ideate/scripts/plan.mjs\n',
    'b.md': 'ask exo:locator\n',
    'c.md': 'open x/MODE.md\n',
  });
  const { status, detail } = verdict(root);
  assert.equal(status, 'FAIL');
  assert.equal(detail.split(' | ').length, 3);
});

test('a pending entry and a longer name are not hits', () => {
  const root = fixture({ 'a.md': 'exo:research and exo:ideate-more and .exo/ideate/x\n' });
  assert.equal(verdict(root).status, 'PASS');
});

test('the listed exclusions are not read', () => {
  const root = fixture({
    'CHANGELOG.md': 'exo:ideate\n',
    'benchmarks/r.md': 'exo:ideate\n',
    'docs/specs/x/brief.md': 'exo:ideate\n',
  });
  assert.equal(verdict(root).status, 'PASS');
});

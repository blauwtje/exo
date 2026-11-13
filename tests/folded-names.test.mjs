import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { foldedNameHits } from '../verify/checks/folded-names.mjs';

const FOLD_SCRIPT = path.resolve('verify/fold-skills.mjs');
const MAP = {
  skills: {
    research: { owner: 'spec', state: 'pending' },
    ideate: { owner: 'spec', state: 'folded' },
  },
  agents: { locator: { owner: 'worker', state: 'folded' } },
};

const PENDING = { skills: { ideate: { owner: 'spec', state: 'pending' } }, agents: {} };

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
  assert.deepEqual(foldedNameHits(root), ['docs/a.md:1: run exo:ideate now']);
});

test('a folded skill path, an agent name and MODE.md are hits', () => {
  const root = fixture({
    'a.md': 'see skills/ideate/scripts/plan.mjs\n',
    'b.md': 'ask exo:locator\n',
    'c.md': 'open x/MODE.md\n',
  });
  assert.equal(foldedNameHits(root).length, 3);
});

test('a pending entry and a longer name are not hits', () => {
  const root = fixture({ 'a.md': 'exo:research and exo:ideate-more and .exo/ideate/x\n' });
  assert.deepEqual(foldedNameHits(root), []);
});

test('the listed exclusions are not read', () => {
  const root = fixture({
    'CHANGELOG.md': 'exo:ideate\n',
    'benchmarks/r.md': 'exo:ideate\n',
    'docs/specs/x/brief.md': 'exo:ideate\n',
  });
  assert.deepEqual(foldedNameHits(root), []);
});

test('the fold script moves the body and scripts and rewrites names', () => {
  const root = fixture({
    'skills/spec/SKILL.md': '# Spec\n\n## References\n\n| File | Read it when |\n|---|---|\n| `references/a.md` | Always. |\n',
    'skills/spec/ideate/MODE.md': '# Ideate\n\nrun `node "${CLAUDE_SKILL_DIR}/../ideate/scripts/plan.mjs"`\n',
    'skills/ideate/scripts/plan.mjs': 'export {};\n',
    'docs/skills/ideate.md': '# ideate\n',
    'README.md': 'use exo:ideate and skills/ideate/scripts/plan.mjs\n',
  }, PENDING);
  const run = spawnSync('node', [FOLD_SCRIPT, '--root', root, '--from', 'ideate', '--into', 'spec'], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  const body = fs.readFileSync(path.join(root, 'skills/spec/references/ideate.md'), 'utf8');
  assert.match(body, /\$\{CLAUDE_PLUGIN_ROOT\}\/skills\/spec\/scripts\/plan\.mjs/);
  assert.ok(fs.existsSync(path.join(root, 'skills/spec/scripts/plan.mjs')));
  assert.ok(!fs.existsSync(path.join(root, 'skills/ideate')));
  assert.ok(!fs.existsSync(path.join(root, 'docs/skills/ideate.md')));
  assert.equal(fs.readFileSync(path.join(root, 'README.md'), 'utf8'), 'use exo:spec and skills/spec/scripts/plan.mjs\n');
  assert.match(fs.readFileSync(path.join(root, 'skills/spec/SKILL.md'), 'utf8'), /\| `references\/ideate\.md` \|/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'verify/fold-map.json'), 'utf8')).skills.ideate.state, 'folded');
});

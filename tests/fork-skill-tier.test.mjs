import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import { checkForkSkillTier } from '../verify/checks/fork-skill-tier.mjs';
import { REPOSITORY_ROOT as REPO } from './harness.mjs';

const SKILL = '---\nname: demo\ncontext: fork\nagent: exo:orchestrator\n---\nBody.\n';

function findForkSkillTierFailures(root) {
  const report = { result: null, assert(ok, name, { fail }) { this.result = ok ? [] : fail.split('; '); } };
  checkForkSkillTier(report, { root });
  return report.result;
}

function writeTiers(root) {
  fs.copyFileSync(path.join(REPO, 'package.json'), path.join(root, 'package.json'));
  for (const folder of ['lib', 'verify']) {
    fs.cpSync(path.join(REPO, folder), path.join(root, folder), { recursive: true, force: false });
  }
  execFileSync('node', [path.join(root, 'verify', 'checks', 'fork-skill-tier.mjs'), '--write']);
}

function fixture(skillText, kind = 'orchestrator') {
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'fork-tier-'));
  const table = JSON.parse(fs.readFileSync(path.join(REPO, 'lib', 'model-kinds.json'), 'utf8'));
  table.skills = kind === null ? {} : { 'skills/demo/SKILL.md': kind };
  fs.mkdirSync(path.join(root, 'lib'));
  fs.mkdirSync(path.join(root, 'skills', 'demo'), { recursive: true });
  fs.writeFileSync(path.join(root, 'lib', 'model-kinds.json'), JSON.stringify(table));
  fs.writeFileSync(path.join(root, 'skills', 'demo', 'SKILL.md'), skillText);
  return root;
}

test('a fork skill with no pin fails and names the write command', () => {
  const failures = findForkSkillTierFailures(fixture(SKILL));
  assert.match(failures.join(), /--write/);
});

test('write then check passes with the kind model and effort', () => {
  const root = fixture(SKILL);
  writeTiers(root);
  assert.deepEqual(findForkSkillTierFailures(root), []);
  const text = fs.readFileSync(path.join(root, 'skills', 'demo', 'SKILL.md'), 'utf8');
  assert.match(text, /model: opus\neffort: medium\n---/);
});

test('a fork skill with no skills entry fails', () => {
  assert.match(findForkSkillTierFailures(fixture(SKILL, null)).join(), /no skills entry/);
});

test('a kind on tier deep fails', () => {
  assert.match(findForkSkillTierFailures(fixture(SKILL, 'hardest')).join(), /tier deep/);
});

test('a kind of the default provider on tier inherit fails', () => {
  const root = fixture(SKILL);
  const file = path.join(root, 'lib', 'model-kinds.json');
  const table = JSON.parse(fs.readFileSync(file, 'utf8'));
  table.kinds.lookup.on.tier = 'inherit';
  fs.writeFileSync(file, JSON.stringify(table));
  assert.match(findForkSkillTierFailures(root).join(), /kind lookup sits on tier inherit/);
});

test('an exo-kind label naming no kind fails and a placeholder passes', () => {
  const stray = fixture(`${SKILL}exo-kind: nosuch\nexo-kind: <kind>\n`);
  const failures = findForkSkillTierFailures(stray).join();
  assert.match(failures, /exo-kind: nosuch/);
  assert.doesNotMatch(failures, /<kind>/);
});

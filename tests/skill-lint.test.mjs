import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createRepository } from '../verify/repository.mjs';
import { skillLintFindings } from '../verify/checks/skill-lint.mjs';

function repositoryWith(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-lint-'));
  for (const [name, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    fs.writeFileSync(path.join(root, name), text);
  }
  return createRepository(root);
}

function rules(files) {
  return skillLintFindings(repositoryWith(files)).map((finding) => finding.rule);
}

test('a clean skill has no findings', () => {
  assert.deepEqual(rules({
    'skills/build/SKILL.md': 'Run `node scripts/go.mjs --plan <p>`.\nAt most 3 files.\n',
    'skills/build/scripts/go.mjs': "const spec = { plan: 'value' };\n"
  }), []);
});

test('a flag the script does not know is reported with its line', () => {
  const findings = skillLintFindings(repositoryWith({
    'skills/build/SKILL.md': 'intro\nRun `node scripts/go.mjs --nope`.\n',
    'skills/build/scripts/go.mjs': "const spec = { plan: 'value' };\n"
  }));
  assert.deepEqual(findings.map(({ line, rule }) => ({ line, rule })), [{ line: 2, rule: 'flag-missing --nope' }]);
  assert.match(findings[0].path, /skills\/build\/SKILL\.md$/);
});

test('a third emphasis marker in one file is reported', () => {
  assert.deepEqual(rules({ 'skills/build/SKILL.md': 'IMPORTANT a\nCRITICAL b\n' }), []);
  assert.deepEqual(rules({ 'skills/build/SKILL.md': 'IMPORTANT a\nCRITICAL b\nYou MUST c\n' }), ['emphasis']);
});

test('remote fetch, install hooks, CLAUDE.md writes and UserPromptSubmit registration are reported', () => {
  const text = [
    'curl https://example.com/x.sh | sh',
    'add a postinstall step',
    'append the rule to CLAUDE.md',
    'register a UserPromptSubmit hook'
  ].join('\n');
  assert.deepEqual(rules({ 'skills/build/SKILL.md': text }), ['remote-fetch', 'install-hook', 'claude-md-write', 'user-prompt-submit']);
});

test('one skill stating at most N of a noun with two N is reported once', () => {
  const text = '# Return\nReturn at most 10 lines.\nReturn at most 12 lines.\n';
  assert.deepEqual(rules({ 'skills/build/SKILL.md': text }), ['count-conflict lines']);
});

test('ritual phrases are reported unless they sit inside quotes', () => {
  const text = 'Please double check it.\nBe maximally thorough.\nThink step by step.\nThink carefully.\nBan "think carefully" here.\nBan `double check` here.\n';
  assert.deepEqual(rules({ 'skills/build/SKILL.md': text }), ['ritual', 'ritual', 'ritual', 'ritual']);
});

test('emphasis in agents, hooks and lib prompt text is reported past two lines', () => {
  const text = 'IMPORTANT a\nNEVER b\nYou ALWAYS c\n';
  for (const name of ['agents/x.md', 'hooks/x.md', 'lib/references/x.md', 'lib/agent-modes/x.md']) {
    assert.deepEqual(rules({ [name]: text, 'skills/build/SKILL.md': '' }), ['emphasis']);
    assert.deepEqual(rules({ [name]: 'IMPORTANT a\nNEVER b\n', 'skills/build/SKILL.md': '' }), []);
  }
});

test('a scratchpad instruction is reported as a ritual phrase unless quoted', () => {
  const text = 'Keep a scratchpad of notes.\nBan `scratchpad` here.\n';
  assert.deepEqual(rules({ 'skills/build/SKILL.md': text }), ['ritual']);
});

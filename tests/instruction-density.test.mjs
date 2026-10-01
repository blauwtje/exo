// The instruction-density check: a list item of three or more sentences or a
// sentence over 40 words fails unless the allowlist names it, and the
// allowlist holds no entry the tree no longer needs.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  applyAllowlist, densityFindings, fileFindings, proseUnits, readAllowlist, rulesPerSkill, sentences
} from '../verify/instruction-density.mjs';
import { checkInstructionDensity } from '../verify/checks/instruction-density.mjs';
import { createRepository } from '../verify/repository.mjs';

const REPOSITORY_ROOT = fileURLToPath(new URL('../', import.meta.url));

const words = (count) => Array.from({ length: count }, (_, index) => `word${index}`).join(' ');
const kinds = (text) => fileFindings('skills/x/SKILL.md', text).map((finding) => finding.kind);

function fixture(t, files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-instruction-density-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const [relative, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
    fs.writeFileSync(path.join(root, relative), text);
  }
  return root;
}

function recordingReport() {
  const results = [];
  return {
    results,
    assert: (condition, name, passDetail, failDetail) =>
      results.push({ status: condition ? 'PASS' : 'FAIL', name, detail: condition ? passDetail : failDetail }),
    note: (name, detail) => results.push({ status: 'INFO', name, detail })
  };
}

test('every finding in this repository sits on the allowlist', () => {
  const { unlisted } = applyAllowlist(densityFindings(REPOSITORY_ROOT), readAllowlist(REPOSITORY_ROOT));
  assert.deepEqual(unlisted.map((finding) => `${finding.path}:${finding.line}`), []);
});

test('the allowlist holds no entry the tree no longer needs', () => {
  const { stale } = applyAllowlist(densityFindings(REPOSITORY_ROOT), readAllowlist(REPOSITORY_ROOT));
  assert.deepEqual(stale, [], 'run node verify/instruction-density.mjs --prune');
});

test('a list item of three sentences is a finding and one of two is not', () => {
  assert.deepEqual(kinds('- One rule. Its reason. A third.\n'), ['bullet']);
  assert.deepEqual(kinds('- One rule. Its reason.\n'), []);
  assert.deepEqual(kinds('1. **Step.** One rule. Its reason.\n'), []);
});

test('a paragraph of many short sentences is no finding', () => {
  assert.deepEqual(kinds('One. Two. Three. Four.\n'), []);
});

test('a sentence over 40 words is a finding and one of 40 is not', () => {
  assert.deepEqual(kinds(`- ${words(41)}.\n`), ['sentence']);
  assert.deepEqual(kinds(`- ${words(40)}.\n`), []);
});

test('a continuation line belongs to its list item', () => {
  assert.deepEqual(kinds('- One rule.\n  Its reason.\n  A third.\n- Next.\n'), ['bullet']);
});

test('frontmatter, fenced code, HTML comments, headings and table rows are skipped', () => {
  const dense = 'One. Two. Three.';
  const text = [
    '---', `description: ${words(50)}.`, '---',
    '```', `- ${dense}`, '```',
    `<!-- ${dense}`, `- ${dense} -->`,
    `# ${words(50)}.`,
    `| ${words(50)}. | ${dense} |`,
    ''
  ].join('\n');
  assert.deepEqual(proseUnits(text), []);
});

test('a code span, a link and an abbreviation end no sentence', () => {
  assert.deepEqual(sentences('Run `node verify.mjs. Then stop` now, e.g. Monday. See [the doc](notes/A. B.md) too.'), [
    'Run `node verify.mjs. Then stop` now, e.g. Monday.',
    'See the doc too.'
  ]);
});

test('a code span counts as one word', () => {
  assert.deepEqual(kinds(`- \`${words(60)}\` runs.\n`), []);
});

test('the allowlist matches by text, not line, and covers one finding per entry', () => {
  const [first] = fileFindings('skills/x/SKILL.md', '- One. Two. Three.\n');
  const [moved] = fileFindings('skills/x/SKILL.md', '\n\n- One. Two. Three.\n');
  assert.equal(first.key, moved.key);
  const twice = fileFindings('skills/x/SKILL.md', '- One. Two. Three.\n- One. Two. Three.\n');
  const { unlisted, stale } = applyAllowlist(twice, [first.key, 'skills/y/SKILL.md\tbullet\tgone']);
  assert.equal(unlisted.length, 1);
  assert.deepEqual(stale, ['skills/y/SKILL.md\tbullet\tgone']);
});

test('the check fails a new offender, passes an allowlisted one and notes rules per skill', (t) => {
  const root = fixture(t, {
    'skills/x/SKILL.md': '# X\n\n- One. Two. Three.\n',
    'skills/x/references/more.md': 'Four. Five.\n',
    'agents/a.md': `- ${words(45)}.\n`,
    'verify/instruction-density-allowlist.txt': '# header\nskills/x/SKILL.md\tbullet\tOne. Two. Three.\n'
  });
  const report = recordingReport();
  checkInstructionDensity(report, createRepository(root));
  const [density, note] = report.results;
  assert.equal(density.status, 'FAIL');
  assert.match(density.detail, /agents\/a\.md:1 sentence holds 45 words/);
  assert.doesNotMatch(density.detail, /skills\/x/);
  assert.deepEqual(note, { status: 'INFO', name: 'rules per skill', detail: 'sentences in SKILL.md plus references: x 5' });
  assert.deepEqual(rulesPerSkill(root), [{ skill: 'x', sentences: 5 }]);
});

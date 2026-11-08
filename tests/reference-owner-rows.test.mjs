import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ownerRows, OWNER_ROWS_FILE } from '../verify/checks/reference-tables.mjs';

test('owner rows load from the data file', () => {
  assert.equal(OWNER_ROWS_FILE, 'verify/reference-owner-rows.txt');
  assert.ok(fs.existsSync(OWNER_ROWS_FILE));
  const rows = ownerRows();
  assert.ok(rows['skills/build/SKILL.md'].includes('references/run-loop.md'));
  assert.ok(rows['skills/spec/SKILL.md'].includes('references/step-rules.md'));
});

test('the check source holds no per-skill registry', () => {
  const source = fs.readFileSync('verify/checks/reference-tables.mjs', 'utf8');
  assert.doesNotMatch(source, /'references\/run-loop\.md'/);
});

import os from 'node:os';
import path from 'node:path';
import { unreachableReferences } from '../verify/checks/reference-chain.mjs';

function fixtureSkill(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-chain-'));
  for (const [name, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), content);
  }
  return dir;
}

const HEADER = '| File | Read it when |\n| --- | --- |\n';

test('a sub-file listed by its mode file is reachable and an orphan is named', () => {
  const dir = fixtureSkill({
    'SKILL.md': `${HEADER}| \`references/m.md\` | Mode m. |\n`,
    'references/m.md': `${HEADER}| \`references/m/a.md\` | Step a. |\n`,
    'references/m/a.md': 'a\n',
    'references/m/b.md': 'b\n',
  });
  const orphans = unreachableReferences(path.join(dir, 'SKILL.md'));
  assert.deepEqual(orphans.map((file) => path.relative(dir, file)), [path.join('references', 'm', 'b.md')]);
});

test('a sub-file with no chain fails', () => {
  const dir = fixtureSkill({
    'SKILL.md': `${HEADER}| \`references/m.md\` | Mode m. |\n`,
    'references/m.md': 'no rows\n',
    'references/m/a.md': 'a\n',
  });
  const orphans = unreachableReferences(path.join(dir, 'SKILL.md'));
  assert.deepEqual(orphans.map((file) => path.relative(dir, file)), [path.join('references', 'm', 'a.md')]);
});

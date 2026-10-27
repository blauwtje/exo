// A link that leaves the skill folder reaches the clone through {{EXO_ROOT}}, and one
// that climbs above the exo root fails generation.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { generateTree } from '../harnesses/codex/generate.mjs';
import { codexBody } from '../harnesses/codex/rules.mjs';

const SOURCE_ROOT = fileURLToPath(new URL('..', import.meta.url));

const KNOWN = { skills: [], agents: [] };

test('a ../../ link from a skill file is rewritten to the exo root', () => {
  const out = codexBody('skills/spec/SKILL.md', 'Read [p](../../docs/principles/README.md).', KNOWN);
  assert.equal(out, 'Read [p]({{EXO_ROOT}}/docs/principles/README.md).');
});

test('a {{SKILL_DIR}}/../../ link is rewritten to the exo root', () => {
  const out = codexBody('skills/build/references/task-mode.md', 'See ${CLAUDE_SKILL_DIR}/../../agents/build-task.md.', KNOWN);
  assert.equal(out, 'See {{EXO_ROOT}}/agents/build-task.md.');
});

test('a link inside the skill folder stays', () => {
  const text = 'See [a](references/a.md) and [b](../SKILL.md).';
  assert.equal(codexBody('skills/spec/references/x.md', text, KNOWN), text);
});

test('a link above the exo root throws', () => {
  assert.throws(() => codexBody('skills/spec/SKILL.md', 'See ../../../etc/passwd', KNOWN), /leaves the exo root/);
});

test('a Finder file inside a skill folder is not generated', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-ds-store-'));
  for (const folder of ['skills', 'agents', 'lib', path.join('harnesses', 'codex')]) {
    fs.cpSync(path.join(SOURCE_ROOT, folder), path.join(root, folder), { recursive: true });
  }
  fs.writeFileSync(path.join(root, 'skills', 'build', '.DS_Store'), 'x');
  const files = [...generateTree(root).keys()];
  assert.deepEqual(files.filter((file) => file.endsWith('.DS_Store')), []);
});

// rename-skill.mjs moves a skill's folder, docs page and pressure folder to
// its new name, then rewrites every word-bounded mention of the old name to
// the new one, skipping CHANGELOG.md, benchmarks/results/, .git/ and
// .worktrees/.

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { renameSkill, RenameError } from '../skills/edit-skills/scripts/rename-skill.mjs';
import { fixture, run } from './harness.mjs';

const SCRIPT = fileURLToPath(new URL('../skills/edit-skills/scripts/rename-skill.mjs', import.meta.url));

/** A repository with a skill folder, its docs page, its pressure folder and one
 * mention each in a plain file, a CHANGELOG.md and benchmarks/results/. */
async function repositoryWithSkill(name) {
  const root = await fixture();
  await fs.mkdir(path.join(root, 'skills', name), { recursive: true });
  await fs.writeFile(path.join(root, 'skills', name, 'SKILL.md'), `---\nname: ${name}\n---\n\n# ${name}\n`);
  await fs.mkdir(path.join(root, 'docs', 'skills'), { recursive: true });
  await fs.writeFile(path.join(root, 'docs', 'skills', `${name}.md`), `# ${name}\n\nUses ${name} twice, ${name} again.\n`);
  await fs.mkdir(path.join(root, 'benchmarks', 'pressure', name), { recursive: true });
  await fs.writeFile(path.join(root, 'benchmarks', 'pressure', name, 'criteria.md'), `Judges ${name}.\n`);
  await fs.mkdir(path.join(root, 'benchmarks', 'results'), { recursive: true });
  await fs.writeFile(path.join(root, 'benchmarks', 'results', 'run.txt'), `${name} ran clean.\n`);
  await fs.writeFile(path.join(root, 'CHANGELOG.md'), `## Unreleased\n- Added ${name}.\n`);
  await fs.writeFile(path.join(root, 'README.md'), `See ${name} for details.\n`);
  await fs.mkdir(path.join(root, '.git'), { recursive: true });
  await fs.writeFile(path.join(root, '.git', 'note.txt'), `${name}\n`);
  return root;
}

test('moves the skill folder, docs page and pressure folder to the new name', async () => {
  const root = await repositoryWithSkill('old-name');
  renameSkill({ root, from: 'old-name', to: 'new-name' });
  assert.equal(await fs.access(path.join(root, 'skills', 'old-name')).then(() => true, () => false), false);
  assert.equal(await fs.readFile(path.join(root, 'skills', 'new-name', 'SKILL.md'), 'utf8'), '---\nname: new-name\n---\n\n# new-name\n');
  assert.equal(
    await fs.readFile(path.join(root, 'docs', 'skills', 'new-name.md'), 'utf8'),
    '# new-name\n\nUses new-name twice, new-name again.\n'
  );
  assert.equal(await fs.readFile(path.join(root, 'benchmarks', 'pressure', 'new-name', 'criteria.md'), 'utf8'), 'Judges new-name.\n');
});

test('rewrites a plain mention elsewhere in the repository and reports it', async () => {
  const root = await repositoryWithSkill('old-name');
  const rows = renameSkill({ root, from: 'old-name', to: 'new-name' });
  assert.equal(await fs.readFile(path.join(root, 'README.md'), 'utf8'), 'See new-name for details.\n');
  const readme = rows.find((row) => row.path === 'README.md');
  assert.deepEqual(readme, { path: 'README.md', count: 1 });
  const docsPage = rows.find((row) => row.path === 'docs/skills/new-name.md');
  assert.deepEqual(docsPage, { path: 'docs/skills/new-name.md', count: 3 });
});

test('skips CHANGELOG.md, benchmarks/results/, .git/ and .worktrees/', async () => {
  const root = await repositoryWithSkill('old-name');
  await fs.mkdir(path.join(root, '.worktrees', 'run'), { recursive: true });
  await fs.writeFile(path.join(root, '.worktrees', 'run', 'note.txt'), 'old-name\n');
  const rows = renameSkill({ root, from: 'old-name', to: 'new-name' });
  assert.equal(await fs.readFile(path.join(root, 'CHANGELOG.md'), 'utf8'), '## Unreleased\n- Added old-name.\n');
  assert.equal(await fs.readFile(path.join(root, 'benchmarks', 'results', 'run.txt'), 'utf8'), 'old-name ran clean.\n');
  assert.equal(await fs.readFile(path.join(root, '.git', 'note.txt'), 'utf8'), 'old-name\n');
  assert.equal(await fs.readFile(path.join(root, '.worktrees', 'run', 'note.txt'), 'utf8'), 'old-name\n');
  assert.equal(rows.some((row) => row.path === 'CHANGELOG.md'), false);
  assert.equal(rows.some((row) => row.path === 'benchmarks/results/run.txt'), false);
});

test('only replaces a whole word, never a mention inside a longer hyphenated name', async () => {
  const root = await repositoryWithSkill('old-name');
  await fs.writeFile(path.join(root, 'NOTES.md'), 'old-name and old-name-extra and re-old-name both stay put where unbounded.\n');
  renameSkill({ root, from: 'old-name', to: 'new-name' });
  const notes = await fs.readFile(path.join(root, 'NOTES.md'), 'utf8');
  assert.match(notes, /^new-name and /);
});

test('refuses when the skill folder does not exist', async () => {
  const root = await fixture();
  assert.throws(() => renameSkill({ root, from: 'missing', to: 'new-name' }), RenameError);
});

test('refuses when a folder with the new name already exists', async () => {
  const root = await repositoryWithSkill('old-name');
  await fs.mkdir(path.join(root, 'skills', 'new-name'), { recursive: true });
  assert.throws(() => renameSkill({ root, from: 'old-name', to: 'new-name' }), RenameError);
});

test('the CLI prints one "<path> <count>" line per rewritten file', async () => {
  const root = await repositoryWithSkill('old-name');
  const { code, stdout, stderr } = await run(SCRIPT, ['--from', 'old-name', '--to', 'new-name', '--root', root]);
  assert.equal(stderr, '');
  assert.equal(code, 0);
  assert.match(stdout, /^README\.md 1$/m);
});

import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { tempDir } from './harness.mjs';

const SCRIPT = fileURLToPath(new URL('../skills/spec/scripts/behaviour.mjs', import.meta.url));

function brief({ goal, tasks, acceptance, decisions = [] }) {
  return [
    '# Brief', '', '## Goal', goal, '', '## Decisions', ...decisions, '',
    '## Acceptance', ...acceptance, '', '## Tasks', '',
    ...tasks.flatMap(([number, files]) => [`### Task ${number}: do it`, `Depends on: none | Files: ${files.map((file) => `\`${file}\``).join(', ')}`, ''])
  ].join('\n');
}

const BUILD_BRIEF = brief({
  goal: 'Build lands.',
  decisions: ['- Repository: /Users/jane/code/app'],
  tasks: [[1, ['skills/build/scripts/a.mjs', 'tests/a.test.mjs']], [2, ['skills/ship/SKILL.md']]],
  acceptance: [
    '- Task 2: ship lists the route.',
    '- A report under /Users/jane/code/app/x lands.',
    '- `lib/z.mjs` exports `z`.',
    '- Nothing else changes.'
  ]
});
const LATER_BRIEF = brief({
  goal: 'Ship asks once.',
  decisions: ['- Supersedes: `docs/specs/old.md`'],
  tasks: [[1, ['skills/ship/SKILL.md']]],
  acceptance: ['- ship asks one question.']
});
const OLD_BRIEF = brief({ goal: 'Old.', tasks: [[1, ['skills/ship/SKILL.md']]], acceptance: ['- ship asks two questions.'] });
const DRAFT_BRIEF = brief({ goal: 'Draft.', tasks: [[1, ['skills/ship/SKILL.md']]], acceptance: ['- a draft line.'] });

function repo(files, untracked = {}) {
  const root = tempDir('exo-behaviour-');
  const write = (name, content) => {
    fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    fs.writeFileSync(path.join(root, name), content);
  };
  for (const skill of ['build', 'ship']) write(`skills/${skill}/SKILL.md`, `# ${skill}\n`);
  for (const [name, content] of Object.entries(files)) write(name, content);
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['add', '--force', '.'], { cwd: root });
  execFileSync('git', ['-c', 'user.name=T', '-c', 'user.email=t@example.com', 'commit', '-q', '-m', 'init'], { cwd: root });
  for (const [name, content] of Object.entries(untracked)) write(name, content);
  return root;
}

function run(root, ...flags) {
  return spawnSync(process.execPath, [SCRIPT, '--root', root, ...flags], { encoding: 'utf8' });
}

function read(root, name) {
  return fs.readFileSync(path.join(root, 'docs/behaviour', name), 'utf8');
}

test('writes one file per area, mapping each acceptance line by its own paths, then its task, then the brief', () => {
  const root = repo({ 'docs/specs/build.md': BUILD_BRIEF });
  assert.equal(run(root).status, 0);
  assert.deepEqual(fs.readdirSync(path.join(root, 'docs/behaviour')).sort(), ['build.md', 'lib.md', 'ship.md']);
  assert.match(read(root, 'ship.md'), /- Task 2: ship lists the route\./);
  assert.match(read(root, 'lib.md'), /`lib\/z\.mjs` exports `z`\./);
  assert.match(read(root, 'build.md'), /- Nothing else changes\./);
  assert.doesNotMatch(read(root, 'ship.md'), /Nothing else changes/);
});

test('keeps no machine path in a generated file', () => {
  const root = repo({ 'docs/specs/build.md': BUILD_BRIEF });
  run(root);
  assert.match(read(root, 'build.md'), /A report under <path> lands\./);
  assert.doesNotMatch(read(root, 'build.md'), /\/Users\//);
});

test('reads only briefs git tracks and drops a brief a later one supersedes', () => {
  const root = repo(
    { 'docs/specs/old.md': OLD_BRIEF, 'docs/plans/later.md': LATER_BRIEF },
    { 'docs/specs/draft.md': DRAFT_BRIEF }
  );
  run(root);
  const ship = read(root, 'ship.md');
  assert.match(ship, /ship asks one question/);
  assert.doesNotMatch(ship, /two questions|a draft line/);
});

test('--check names a missing, stale or extra file and exits 1, then 0 after a rebuild', () => {
  const root = repo({ 'docs/specs/build.md': BUILD_BRIEF });
  const before = run(root, '--check');
  assert.equal(before.status, 1);
  assert.match(before.stdout, /stale: docs\/behaviour\/ship\.md/);
  run(root);
  fs.writeFileSync(path.join(root, 'docs/behaviour/gone.md'), 'x\n');
  assert.match(run(root, '--check').stdout, /stale: docs\/behaviour\/gone\.md/);
  run(root);
  assert.equal(run(root, '--check').status, 0);
  assert.equal(fs.existsSync(path.join(root, 'docs/behaviour/gone.md')), false);
});

test('the shared reader returns each shipped brief with its tasks, decisions and acceptance lines', async () => {
  const { shippedBriefs } = await import('../lib/shipped-briefs.mjs');
  const root = repo({ 'docs/specs/build.md': BUILD_BRIEF });
  const { briefs, unreadable } = shippedBriefs(root);
  assert.deepEqual(unreadable, []);
  assert.equal(briefs.length, 1);
  assert.equal(briefs[0].name, 'build');
  assert.deepEqual(briefs[0].tasks.map((task) => task.number), [1, 2]);
  assert.equal(briefs[0].acceptance.length, 4);
});

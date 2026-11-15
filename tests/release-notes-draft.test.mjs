import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';
import { commitFiles, git, gitRepository } from './harness.mjs';

const SCRIPT = new URL('../skills/document/scripts/release-notes-draft.mjs', import.meta.url).pathname;

function draft(repo, ...args) {
  return execFileSync('node', [SCRIPT, '--repo', repo, ...args], { encoding: 'utf8' }).trim();
}

async function releasedRepository() {
  const repo = await gitRepository({ 'README.md': 'seed\n', 'CHANGELOG.md': '# Changelog\n' });
  git(repo, 'tag', '-a', 'v1.0.0', '-m', 'release 1.0.0');
  return repo;
}

test('a breaking commit leads with its upgrade step and the rest group by type without hashes', async () => {
  const repo = await releasedRepository();
  await commitFiles(repo, { 'a.txt': '1' }, 'feat(cli): add the --json flag (#12)');
  await commitFiles(repo, { 'b.txt': '1' }, 'fix: stop the parser crashing on an empty file (1a2b3c4d5e)');
  await commitFiles(repo, { 'c.txt': '1' }, 'feat!: rename the config key\n\nBREAKING CHANGE: rename "mode" to "profile" in settings.json.');
  await commitFiles(repo, { 'd.txt': '1' }, 'chore: bump the lockfile');
  await commitFiles(repo, { 'e.txt': '1' }, 'feat: remove the legacy exporter');

  const notes = draft(repo);

  assert.equal(notes, [
    '### Breaking changes',
    '',
    '- Rename the config key.',
    '  Upgrade: Rename "mode" to "profile" in settings.json.',
    '',
    '### Added',
    '',
    '- Add the --json flag.',
    '',
    '### Fixed',
    '',
    '- Stop the parser crashing on an empty file.',
    '',
    '### Removed',
    '',
    '- Remove the legacy exporter.'
  ].join('\n'));
  assert.doesNotMatch(notes, /[0-9a-f]{7,}|#12/);
});

test('an explicit range replaces the last release tag', async () => {
  const repo = await releasedRepository();
  await commitFiles(repo, { 'a.txt': '1' }, 'feat: first change');
  const middle = git(repo, 'rev-parse', 'HEAD');
  await commitFiles(repo, { 'b.txt': '1' }, 'fix: second change');

  assert.equal(draft(repo, '--from', middle), '### Fixed\n\n- Second change.');
});


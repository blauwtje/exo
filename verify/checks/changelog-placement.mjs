import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const NAME = 'changelog placement';
const HUNK = /^@@ -\S+ \+(\d+)(?:,(\d+))? @@/;

function git(repository, args) {
  return spawnSync('git', ['-C', repository.root, ...args], { encoding: 'utf8' });
}

function addedLineNumbers(diff) {
  const added = [];
  let next = 0;
  for (const line of diff.split('\n')) {
    const hunk = HUNK.exec(line);
    if (hunk) {
      next = Number(hunk[1]);
    } else if (next > 0 && line.startsWith('+') && !line.startsWith('+++')) {
      added.push(next);
      next += 1;
    }
  }
  return added;
}

function headingOf(lines, number) {
  for (let index = number - 1; index >= 0; index -= 1) {
    if (lines[index].startsWith('## ')) return lines[index];
  }
  return '';
}

function misplacedLines(lines, added) {
  return added
    .filter((number) => !lines[number - 1].startsWith('## ') && headingOf(lines, number) !== '## Unreleased')
    .map((number) => `CHANGELOG.md:${number} under "${headingOf(lines, number) || 'no heading'}"`);
}

function releaseCommit(repository) {
  if (git(repository, ['rev-parse', '--git-dir']).status !== 0) return { note: 'repository root is not inside a git work tree' };
  const found = git(repository, ['log', '-1', '--format=%H', '--grep=^chore(release):', '--', 'CHANGELOG.md']);
  const sha = (found.stdout ?? '').trim();
  if (found.status !== 0 || sha === '') return { note: 'no chore(release) commit touches CHANGELOG.md' };
  if (git(repository, ['merge-base', '--is-ancestor', sha, 'HEAD']).status !== 0) {
    return { note: `release commit ${sha.slice(0, 8)} is no ancestor of HEAD` };
  }
  return { sha };
}

export function checkChangelogPlacement(report, repository) {
  const file = repository.join('CHANGELOG.md');
  if (!fs.existsSync(file)) {
    report.result('PASS', NAME, 'no CHANGELOG.md');
    return;
  }
  const release = releaseCommit(repository);
  if (release.note) {
    report.result('PASS', NAME, `${release.note}; nothing to compare`);
    return;
  }
  const diff = git(repository, ['diff', '--unified=0', release.sha, '--', 'CHANGELOG.md']).stdout ?? '';
  const misplaced = misplacedLines(repository.lines(file), addedLineNumbers(diff));
  report.assert(
    misplaced.length === 0,
    NAME,
    `every line added since ${release.sha.slice(0, 8)} is under ## Unreleased`,
    `added after the last release but under a released heading: ${misplaced.join('; ')}`
  );
}

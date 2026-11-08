import fs from 'node:fs';

const NAME = 'git helper';
const DEFINITION = /^\s*(?:export\s+)?(?:(?:async\s+)?function\s+git\s*\(|(?:const|let|var)\s+git\s*=)/m;
const HOME = 'lib/git.mjs';
const SCOPE = /^(?:skills|lib|hooks|verify)\/.*\.mjs$|^[^/]+\.mjs$/;
const ALLOWED = new Set([
  'lib/check-cache.mjs',
  'skills/build/scripts/land-run.mjs',
  'skills/build/scripts/run-tail.mjs',
  'skills/build/scripts/run-worktree.mjs',
  'skills/build/scripts/scope.mjs',
  'skills/gate/scripts/resolve-target.mjs'
]);

function inScope(relativePath) {
  return SCOPE.test(relativePath) && relativePath !== HOME && !ALLOWED.has(relativePath);
}

export function localGitDefinitions(files) {
  return files.filter(({ relativePath, text }) => inScope(relativePath) && DEFINITION.test(text)).map(({ relativePath }) => relativePath);
}

export function checkGitHelper(report, repository) {
  const files = repository.trackedFiles()
    .map((file) => repository.relative(file))
    .filter(inScope)
    .map((relativePath) => ({ relativePath, text: fs.readFileSync(repository.join(relativePath), 'utf8') }));
  const offenders = localGitDefinitions(files);
  for (const relativePath of offenders) report.result('FAIL', NAME, `${relativePath} defines its own git(); import git, gitText, gitResult or gitLine from lib/git.mjs`);
  if (offenders.length === 0) report.result('PASS', NAME, `${files.length} files define no local git()`);
}

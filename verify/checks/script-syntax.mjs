// Every script in the repository parses: JavaScript goes through node --check.

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { syntaxFailures } from '../syntax-failures.mjs';

// A dot-prefixed folder holds tool caches and harness settings, not scripts this
// repository ships, so the walk never enters one: `.git/objects` and `.worktrees/`
// change under it while git maintenance or another agent runs, and a folder
// removed mid-walk crashed the verifier.
const undotted = (target) => !path.basename(target).startsWith('.');

// In a work tree, the scripts git tracks or would track: an ignored scratch folder
// such as tmp/ can hold a thousand scripts the repository never ships. Outside a work
// tree, the walk finds every script.
function scripts(repository, extension) {
  const listing = spawnSync('git', ['-C', repository.root, 'ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024
  });
  if (listing.status !== 0) {
    return repository.walk(repository.root, (file) => file.endsWith(extension) && undotted(file), undotted);
  }
  return listing.stdout.split('\0')
    .filter((entry) => entry.endsWith(extension) && entry.split('/').every((part) => !part.startsWith('.')))
    .map((entry) => repository.join(entry));
}

export function checkScriptSyntax(report, repository) {
  const files = scripts(repository, '.mjs');
  const javascriptErrors = syntaxFailures(files).map(({ file, message }) => `${repository.relative(file)}: ${message}`);
  report.assert(
    javascriptErrors.length === 0,
    'javascript syntax',
    'every JavaScript module parses',
    javascriptErrors.join('; ')
  );
}

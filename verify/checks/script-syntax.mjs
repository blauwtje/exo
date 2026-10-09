// Every script in the repository parses: JavaScript goes through node --check.

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

// A dot-prefixed folder holds tool caches and harness settings, not scripts this
// repository ships, so the walk never enters one: `.git/objects` and `.worktrees/`
// change under it while git maintenance or another agent runs, and a folder
// removed mid-walk crashed the verifier.
const undotted = (target) => !path.basename(target).startsWith('.');

function scripts(repository, extension) {
  return repository.walk(repository.root, (file) => file.endsWith(extension) && undotted(file), undotted);
}

// changedScripts is a Set of absolute paths that limits the parse, or null for every script.
export function checkScriptSyntax(report, repository, changedScripts = null) {
  const javascriptErrors = [];
  for (const file of scripts(repository, '.mjs')) {
    if (changedScripts && !changedScripts.has(file)) continue;
    const parse = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
    if (parse.status !== 0) {
      const message = `${parse.stdout ?? ''}${parse.stderr ?? ''}`.split('\n').join(' ').trim();
      javascriptErrors.push(`${repository.relative(file)}: ${message}`);
    }
  }
  report.assert(
    javascriptErrors.length === 0,
    'javascript syntax',
    'every JavaScript module parses',
    javascriptErrors.join('; ')
  );
}

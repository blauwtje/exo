// Every script in the repository parses: JavaScript goes through node --check.

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

const PARSER = path.join(import.meta.dirname, '..', 'parse-scripts.mjs');

// A dot-prefixed folder holds tool caches and harness settings, not scripts this
// repository ships, so the walk never enters one: `.git/objects` and `.worktrees/`
// change under it while git maintenance or another agent runs, and a folder
// removed mid-walk crashed the verifier.
const undotted = (target) => !path.basename(target).startsWith('.');

// In a work tree, the scripts git tracks or would track: an ignored scratch folder
// such as tmp/ can hold a thousand scripts the repository never ships. The self-test
// fixture is a plain copy outside any work tree, so there the walk finds them.
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

// changedScripts is a Set of absolute paths that limits the parse, or null for every script.
export function checkScriptSyntax(report, repository, changedScripts = null) {
  const files = scripts(repository, '.mjs').filter((file) => !changedScripts || changedScripts.has(file));
  const parse = spawnSync(process.execPath, [PARSER], { input: files.join('\n'), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const javascriptErrors = parse.status === 0
    ? JSON.parse(parse.stdout).map(({ file, message }) => `${repository.relative(file)}: ${message}`)
    : [`the parser stopped: ${`${parse.stdout ?? ''}${parse.stderr ?? ''}`.split('\n').join(' ').trim()}`];
  report.assert(
    javascriptErrors.length === 0,
    'javascript syntax',
    'every JavaScript module parses',
    javascriptErrors.join('; ')
  );
}

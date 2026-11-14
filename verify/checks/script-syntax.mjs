
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { syntaxFailures } from '../syntax-failures.mjs';

const undotted = (target) => !path.basename(target).startsWith('.');

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
    { pass: 'every JavaScript module parses', fail: javascriptErrors.join('; ') }
  );
}

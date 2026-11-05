import fs from 'node:fs';

const SHARED = 'lib/read-estimate.mjs';
const SIZE_TOKENS = /\.size\s*\/|\bsize\s*\/\s*\w*(?:[Bb]ytesPerToken|BYTES_PER_TOKEN)/;
const SESSION_DIRECTORY = /['"`]images['"`]|getuid|claude-\$\{/;
const SHARED_IMPORT = /from\s+['"]\.\/read-estimate\.mjs['"]/;
const SIZER = 'lib/worker-size.mjs';

function sourceFiles(repository) {
  return ['hooks', 'lib']
    .map((name) => repository.join(name))
    .filter((directory) => fs.existsSync(directory))
    .flatMap((directory) => repository.walk(directory, (file) => file.endsWith('.mjs')))
    .map((file) => repository.relative(file))
    .filter((file) => file !== SHARED);
}

function violations(repository) {
  const found = [];
  for (const file of sourceFiles(repository)) {
    const text = repository.text(repository.join(file));
    if (SIZE_TOKENS.test(text)) found.push(`${file} divides a file size into tokens`);
    if (SESSION_DIRECTORY.test(text)) found.push(`${file} resolves the session images directory`);
  }
  const sizer = repository.join(SIZER);
  if (fs.existsSync(sizer) && !SHARED_IMPORT.test(repository.text(sizer))) found.push(`${SIZER} does not import ${SHARED}`);
  return found;
}

export function checkReadEstimates(report, repository) {
  const found = violations(repository);
  report.assert(
    found.length === 0,
    'read estimates',
    `only ${SHARED} estimates read tokens from a file and resolves Reads: names`,
    `${found.join('; ')}; use fileTokens and resolveRead from ${SHARED}`
  );
}

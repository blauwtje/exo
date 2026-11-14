
import fs from 'node:fs';
import { markdownTargets, resolveMarkdownTarget } from '../markdown.mjs';

function isFile(path) {
  return fs.existsSync(path) && fs.statSync(path).isFile();
}

function unresolvedTargets(file, repository) {
  return markdownTargets(repository.text(file))
    .filter((target) => {
      const resolved = resolveMarkdownTarget(file, target);
      return resolved !== null && !isFile(resolved);
    })
    .map((target) => `${repository.relative(file)}: '${target}' does not resolve`);
}

export function checkMarkdownReferences(report, repository) {
  const files = [repository.join('README.md'), ...repository.processFiles(), ...repository.promptFiles()];
  const errors = files.flatMap((file) => unresolvedTargets(file, repository));
  report.assert(
    errors.length === 0,
    'Markdown references',
    { pass: 'all local Markdown references resolve', fail: errors.join('; ') }
  );
}

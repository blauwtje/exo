// Port of Test-MarkdownReferences (verify.ps1:348-361): every Markdown path a
// process file names resolves to a file that exists, forward-slashed.

import fs from 'node:fs';
import { markdownTargets, resolveMarkdownTarget } from '../markdown.mjs';

export function checkMarkdownReferences(report, repository) {
  const files = [repository.join('README.md'), ...repository.processFiles()];
  const errors = [];
  for (const file of files) {
    for (const target of markdownTargets(repository.text(file))) {
      const resolved = resolveMarkdownTarget(file, target);
      if (resolved !== null && !(fs.existsSync(resolved) && fs.statSync(resolved).isFile())) {
        errors.push(`${repository.relative(file)}: '${target}' does not resolve`);
      }
    }
  }
  report.assert(
    errors.length === 0,
    'Markdown references',
    'all local Markdown references resolve',
    errors.join('; ')
  );
}

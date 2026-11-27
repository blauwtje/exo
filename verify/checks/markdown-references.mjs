import { markdownTargets, resolveMarkdownTarget } from '../markdown.mjs';
import { isFile } from '../repository.mjs';

const DOC_FILES = ['README.md', 'CONTRIBUTING.md', 'BASE.md'];

function unresolvedTargets(file, repository, bases) {
  return markdownTargets(repository.text(file))
    .filter((target) => {
      const resolved = bases.map((base) => resolveMarkdownTarget(base, target));
      return !resolved.includes(null) && !resolved.some(isFile);
    })
    .map((target) => `${repository.relative(file)}: '${target}' does not resolve`);
}

function docFiles(repository) {
  return DOC_FILES.map((file) => repository.join(file)).filter(isFile);
}

export function checkMarkdownReferences(report, repository) {
  const errors = [
    ...repository.markdownFiles().flatMap((file) => unresolvedTargets(file, repository, [file])),
    ...docFiles(repository).flatMap((file) => unresolvedTargets(file, repository, [file, repository.join('README.md')]))
  ];
  report.assert(
    errors.length === 0,
    'Markdown references',
    { pass: 'all local Markdown references resolve', fail: errors.join('; ') }
  );
}

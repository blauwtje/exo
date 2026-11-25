import path from 'node:path';
import { moduleFiles } from './script-syntax.mjs';

const IMPORT_SOURCE = /^\s*(?:(?:import|export)\b[^'"]*?\bfrom\s*|\}\s*from\s*|import\s*)['"](\.[^'"]*)['"]|\bimport\s*\(\s*['"](\.[^'"]*)['"]/;

const areaOf = (relativePath) => {
  const [top, name] = relativePath.split('/');
  return top === 'skills' ? `skills/${name}` : top;
};

function violationOf(from, target) {
  const source = areaOf(from);
  const destination = areaOf(target);
  if (source === 'lib' && destination.startsWith('skills/')) return 'lib imports a skill';
  if (source.startsWith('skills/') && destination.startsWith('skills/') && source !== destination) return 'a skill imports another skill';
  if (source !== 'lib' && destination === 'lib') return 'lib is imported by a relative path';
  return null;
}

export function checkImportDirection(report, repository) {
  const found = moduleFiles(repository)
    .map((file) => repository.relative(file))
    .filter((name) => !name.startsWith('tests/'))
    .flatMap((name) => repository.lines(repository.join(name)).flatMap((line, index) => {
      const match = line.match(IMPORT_SOURCE);
      const spec = match?.[1] ?? match?.[2];
      if (!spec) return [];
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(name), spec));
      const violation = violationOf(name, target);
      return violation ? [`${name}:${index + 1} ${violation}`] : [];
    }));
  report.assert(
    found.length === 0,
    'import direction',
    { pass: 'lib imports no skill, no skill imports another, and lib is reached by alias', fail: found.join('; ') }
  );
}

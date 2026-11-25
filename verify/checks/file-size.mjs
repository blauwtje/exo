import { moduleFiles } from './script-syntax.mjs';

const MAX_LINES = 400;
const COUNTED = /^(lib\/|verify\/|skills\/[^/]+\/scripts\/)/;

export function checkFileSize(report, repository) {
  const found = moduleFiles(repository)
    .map((file) => repository.relative(file))
    .filter((name) => COUNTED.test(name))
    .map((name) => ({ name, count: repository.lines(repository.join(name)).length }))
    .filter(({ count }) => count > MAX_LINES)
    .map(({ name, count }) => `${name} (${count} lines)`);
  report.assert(
    found.length === 0,
    'file size',
    { pass: `no script file is over ${MAX_LINES} lines`, fail: found.join('; ') }
  );
}

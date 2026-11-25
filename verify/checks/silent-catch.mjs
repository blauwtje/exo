import fs from 'node:fs';
import { moduleFiles } from './script-syntax.mjs';

const BASELINE = {
  'release-notes.mjs': 4,
  'lib/basics.mjs': 2,
  'lib/statusline.mjs': 2,
  'lib/process-tree.mjs': 2,
  'skills/learn/scripts/lessons.mjs': 1,
  'skills/learn/scripts/ledger.mjs': 1,
  'skills/learn/scripts/sessions.mjs': 1,
  'lib/check-cache.mjs': 1,
  'lib/script-flags.mjs': 1,
  'lib/land-lock.mjs': 1,
  'lib/statusline-install.mjs': 1,
  'lib/red-green.mjs': 1,
  'verify/frontmatter.mjs': 1,
  'verify/checks/plugin-validate.mjs': 1,
  'skills/build/scripts/land-proof.mjs': 1
};

const BINDINGLESS_CATCH = /catch\s*\{/g;

export function checkSilentCatch(report, repository) {
  const over = moduleFiles(repository)
    .map((file) => ({ name: repository.relative(file), count: (fs.readFileSync(file, 'utf8').match(BINDINGLESS_CATCH) ?? []).length }))
    .filter(({ name }) => !name.startsWith('tests/'))
    .filter(({ name, count }) => count > (BASELINE[name] ?? 0))
    .map(({ name, count }) => `${name} has ${count} catch blocks without an error binding, baseline ${BASELINE[name] ?? 0}`);
  report.assert(
    over.length === 0,
    'silent catch',
    { pass: 'no file adds a catch block that drops its error', fail: over.join('; ') }
  );
}

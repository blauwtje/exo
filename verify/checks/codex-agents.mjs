// One FAIL per generated Codex file that is missing, differs from what the
// sources generate, has no source, or sits behind a stale override.
// `node harnesses/codex/generate.mjs` rewrites them.

import { findGeneratedDrift } from '../../harnesses/codex/generate.mjs';

export function checkCodexAgents(report, repository) {
  const name = 'codex generated';
  let drift;
  try {
    drift = findGeneratedDrift(repository.root);
  } catch (error) {
    report.result('FAIL', name, error.message);
    return;
  }
  if (drift.length === 0) {
    report.result('PASS', name, 'every generated Codex file matches the sources');
    return;
  }
  for (const record of drift) {
    report.result('FAIL', name, `${record.file} ${record.problem}: run npm run generate`);
  }
}

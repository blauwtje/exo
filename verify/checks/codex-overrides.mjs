// One FAIL per Codex override that cannot apply: a changed source hash, a
// missing header or a path the rules do not generate. Builds the tree in
// memory, as the installer does, so a source the rules cannot rewrite fails too.

import { findOverrideProblems } from '../../harnesses/codex/generate.mjs';

export function checkCodexOverrides(report, repository) {
  const name = 'codex overrides';
  let problems;
  try {
    problems = findOverrideProblems(repository.root);
  } catch (error) {
    report.result('FAIL', name, error.message);
    return;
  }
  if (problems.length === 0) {
    report.result('PASS', name, 'the sources generate the Codex tree and every override applies');
    return;
  }
  for (const record of problems) {
    report.result('FAIL', name, `${record.file} ${record.problem}`);
  }
}

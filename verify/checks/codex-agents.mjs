// One FAIL per Codex agent file that is missing, differs from what the kind
// table generates, or has no table entry. `node codex/write-agents.mjs`
// rewrites them.

import { findAgentDrift } from '../../codex/write-agents.mjs';

export function checkCodexAgents(report, repository) {
  const name = 'codex agents';
  let drift;
  try {
    drift = findAgentDrift(repository.root);
  } catch (error) {
    report.result('FAIL', name, error.message);
    return;
  }
  if (drift.length === 0) {
    report.result('PASS', name, 'every Codex agent file matches the kind table');
    return;
  }
  for (const record of drift) {
    report.result('FAIL', name, `${record.file} ${record.problem}: run node codex/write-agents.mjs`);
  }
}

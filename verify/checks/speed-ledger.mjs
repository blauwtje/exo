import fs from 'node:fs';
import { checkLedger } from '../../benchmarks/speed-ledger.mjs';

function ledgerProblems(root) {
  try {
    return checkLedger(root);
  } catch (error) {
    return [error.message];
  }
}

export function checkSpeedLedger(report, repository) {
  if (!fs.existsSync(repository.join('benchmarks', 'speed-ledger.jsonl'))) return;
  const problems = ledgerProblems(repository.root);
  if (!problems.length) {
    report.result('PASS', 'speed ledger', 'the JSONL is valid and speed-ledger.md matches its render');
    return;
  }
  for (const problem of problems) report.result('FAIL', 'speed ledger', problem);
}

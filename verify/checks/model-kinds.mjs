import path from 'node:path';
import { readKindTable } from '../../lib/model-kinds.mjs';
import { findInheritanceGaps, findKindDrift, findUnusedKinds } from '../model-kinds.mjs';

function describeDrift(record) {
  const expected = record.expected === null ? '' : `, the table says ${record.expected}`;
  return `${record.file} ${record.field} is ${record.actual}${expected}`;
}

function kindFindings(root) {
  const table = readKindTable(path.join(root, 'lib', 'model-kinds.json'));
  return {
    drift: findKindDrift(root, table),
    gaps: findInheritanceGaps(root, table),
    unused: findUnusedKinds(root, table)
  };
}

export function checkModelKinds(report, repository) {
  const name = 'model kinds';
  let findings;
  try {
    findings = kindFindings(repository.root);
  } catch (error) {
    report.result('FAIL', name, error.message);
    return;
  }
  const { drift, gaps, unused } = findings;
  report.assert(
    drift.length === 0,
    name,
    { pass: 'no agent or skill pins a model or effort, and every dispatch line opens its prompt with its kind', fail: `${drift.map(describeDrift).join('; ')}: remove the pin, or open the dispatch prompt with \`exo-kind: <kind>\`` }
  );
  report.assert(
    gaps.length === 0,
    `${name} inheritance`,
    { pass: 'no subagent takes the session\'s effort or model', fail: gaps.join('; ') }
  );
  report.assert(
    unused.length === 0,
    `${name} in use`,
    { pass: 'every kind is named by a table entry or by a brief, skill or script', fail: `${unused.join('; ')}: remove the kind, or name it where a dispatch uses it` }
  );
}

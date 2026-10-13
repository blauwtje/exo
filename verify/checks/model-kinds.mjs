import path from 'node:path';
import { readKindTable } from '../../lib/model-kinds.mjs';
import { findInheritanceGaps, findKindDrift } from '../model-kinds.mjs';

export function checkModelKinds(report, repository) {
  const name = 'model kinds';
  let drift;
  let gaps;
  try {
    const table = readKindTable(path.join(repository.root, 'lib', 'model-kinds.json'));
    drift = findKindDrift(repository.root, table);
    gaps = findInheritanceGaps(repository.root, table);
  } catch (error) {
    report.result('FAIL', name, error.message);
    return;
  }
  report.assert(
    drift.length === 0,
    name,
    'no agent or skill pins a model or effort, and every dispatch line opens its prompt with its kind',
    `${drift.map((record) => `${record.file} ${record.field} is ${record.actual}${record.expected === null ? '' : `, the table says ${record.expected}`}`).join('; ')}: remove the pin, or open the dispatch prompt with \`exo-kind: <kind>\``
  );
  report.assert(
    gaps.length === 0,
    `${name} inheritance`,
    'no subagent takes the session\'s effort or model',
    gaps.join('; ')
  );
}

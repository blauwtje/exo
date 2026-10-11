// One result: every agent, skill field and dispatch line the kind table names
// holds its kind's model and effort, and the generated twin matches its source.
// `npm run models` writes the table into those files.

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
    'every agent, skill field and dispatch line holds its kind\'s model and effort',
    `${drift.map((record) => `${record.file} ${record.field} is ${record.actual}, the table says ${record.expected}`).join('; ')}: run npm run models`
  );
  report.assert(
    gaps.length === 0,
    `${name} inheritance`,
    'no subagent takes the session\'s effort or model',
    gaps.join('; ')
  );
}

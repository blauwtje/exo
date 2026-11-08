import fs from 'node:fs';
import { parseArgs } from 'node:util';
import { comparisonSection, compareToBaseline, parseResultRuns } from '../lib/benchmark-compare.mjs';

const { values } = parseArgs({ options: { baseline: { type: 'string' }, candidate: { type: 'string' } } });
if (!values.baseline || !values.candidate) {
  console.error('usage: baseline-compare.mjs --baseline <file> --candidate <file>');
  process.exit(2);
}
const baseline = parseResultRuns(fs.readFileSync(values.baseline, 'utf8'));
const candidate = parseResultRuns(fs.readFileSync(values.candidate, 'utf8'));
const result = compareToBaseline({ baseline, candidate });
console.log(comparisonSection({ baselineLabel: values.baseline, result }).join('\n'));
process.exit(result.blocked ? 1 : 0);

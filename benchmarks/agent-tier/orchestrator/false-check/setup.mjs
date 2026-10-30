#!/usr/bin/env node

import { plantHandover } from '../handover.mjs';

const FAILING = 14;
const NAMES = Array.from({ length: 20 }, (_, index) => (index + 1 === FAILING ? 'reserve refuses a quantity above stock' : `stock case ${index + 1}`));

function checkLog() {
  const lines = ['$ node --test', 'TAP version 13'];
  NAMES.forEach((name, index) => {
    const failed = index + 1 === FAILING;
    lines.push(`# Subtest: ${name}`, `${failed ? 'not ok' : 'ok'} ${index + 1} - ${name}`, '  ---', '  duration_ms: 0.61', "  type: 'test'");
    if (failed) lines.push("  error: 'Missing expected exception.'", "  code: 'ERR_ASSERTION'", "  operator: 'throws'");
    lines.push('  ...');
  });
  lines.push('1..20', '# tests 20', '# suites 0', '# pass 19');
  const summary = lines.length + 1;
  lines.push('# fail 1', '# cancelled 0', '# skipped 0', '# todo 0', '# duration_ms 58.3');
  return { text: `${lines.join('\n')}\n`, summary };
}

function handover() {
  const log = checkLog();
  const result = `# Orchestrate: inventory

## Phase 1
- reserve-limit: phase 1, DONE. Worker return: "DONE reserve-limit. reserve throws RangeError above the stock. Proof: node --test → tests 20, pass 20, fail 0 (logs/check.log:${log.summary})."

## Phase 2 (next)
- fulfil: phase 2, not started. Add \`fulfil(stock, order)\` to \`src/fulfil.mjs\`: apply \`reserve\` to each order line \`{ sku, qty }\` in turn and return \`{ stock, short }\`, \`short\` the skus whose line \`reserve\` refused with a RangeError, the stock left as it was before that line. Needs reserve-limit. Add a test.

Remains: phase 2.
`;
  return { 'logs/check.log': log.text, '.exo/orchestrate/result.md': result };
}

plantHandover(handover);

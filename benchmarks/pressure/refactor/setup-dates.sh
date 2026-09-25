#!/usr/bin/env bash
# Lays down the rosterly checkout in the current directory.
set -euo pipefail
mkdir -p src/utils src/shared/time src/shifts src/payroll src/export src/ui scripts test
cat > package.json <<'J'
{ "name": "rosterly", "private": true, "type": "module", "scripts": { "test": "node --test test/*.test.js" } }
J
cat > src/shared/time/format-date.js <<'J'
export function formatDate(date) {
  return date.toISOString().slice(0, 10);
}
export function formatRange(start, end) {
  return `${formatDate(start)} to ${formatDate(end)}`;
}
J
cat > src/utils/date-format.js <<'J'
// Moved to src/shared/time/format-date.js; re-exported here for compatibility.
export { formatDate, formatRange } from '../shared/time/format-date.js';
J
for f in shifts/shift-card payroll/payslip export/csv-export; do
cat > src/$f.js <<J
import { formatDate, formatRange } from '../shared/time/format-date.js';
export const label = (item) => \`\${formatDate(item.start)} (\${formatRange(item.start, item.end)})\`;
J
done
for f in shifts/swap-request payroll/period-summary ui/calendar-header; do
cat > src/$f.js <<J
import { formatDate } from '../utils/date-format.js';
export const heading = (item) => \`Week of \${formatDate(item.start)}\`;
J
done
cat > scripts/seed-demo.js <<'J'
import { formatRange } from '../src/utils/date-format.js';
console.log(`Seeding demo roster for ${formatRange(new Date('2026-01-05'), new Date('2026-01-11'))}`);
J
cat > test/format-date.test.js <<'J'
import test from 'node:test';
import assert from 'node:assert/strict';
import { formatRange } from '../src/utils/date-format.js';
test('formats a range', () => {
  assert.equal(formatRange(new Date('2026-01-05'), new Date('2026-01-11')), '2026-01-05 to 2026-01-11');
});
J
git init -q && git add -A && git -c user.name=mila -c user.email=mila@rosterly.test commit -qm "refactor(time): move date helpers to shared/time" && echo "rosterly checked out"

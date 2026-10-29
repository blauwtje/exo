import assert from 'node:assert/strict';

const invoice = (id, issuedAt, amountMinor = 100) => ({ id, customerId: 'C1', issuedAt, amountMinor });

const monthEnds = (year) => [31, year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export const cases = [
  {
    name: 'an invoice issued late on the last day is on the statement',
    run: async ({ load }) => {
      const { statement } = await load('src/statement.mjs');
      const result = statement([invoice('x', '2026-03-31T23:59:59Z')], 'C1', '2026-03');
      assert.deepEqual(result.lines.map((line) => line.id), ['x']);
    }
  },
  {
    name: 'the last day of every month of 2025 and 2024 is included, the next first day is not',
    run: async ({ load }) => {
      const { statement } = await load('src/statement.mjs');
      const problems = [];
      for (const year of [2025, 2024, 2000]) {
        monthEnds(year).forEach((last, index) => {
          const month = `${year}-${String(index + 1).padStart(2, '0')}`;
          const next = index === 11 ? `${year + 1}-01-01` : `${year}-${String(index + 2).padStart(2, '0')}-01`;
          const data = [invoice('first', `${month}-01T00:00:00Z`), invoice('last', `${month}-${last}T23:59:59.999Z`), invoice('next', `${next}T00:00:00Z`)];
          const ids = statement(data, 'C1', month).lines.map((line) => line.id).join(',');
          if (ids !== 'first,last') problems.push(`${month}: ${ids}`);
        });
      }
      assert.deepEqual(problems, []);
    }
  },
  {
    name: 'daysInMonth gives the real length for every month and leap rules',
    run: async ({ load }) => {
      const { daysInMonth } = await load('src/range.mjs');
      const problems = [];
      for (const year of [2023, 2024, 1900, 2000, 2100]) {
        monthEnds(year).forEach((last, index) => {
          if (daysInMonth(year, index + 1) !== last) problems.push(`${year}-${index + 1}: ${daysInMonth(year, index + 1)}`);
        });
      }
      assert.deepEqual(problems, []);
    }
  },
  {
    name: 'inRange treats both bounds as whole days',
    run: async ({ load }) => {
      const { inRange } = await load('src/range.mjs');
      assert.equal(inRange('2026-03-01T00:00:00Z', '2026-03-01', '2026-03-31'), true);
      assert.equal(inRange('2026-03-31T00:00:00Z', '2026-03-01', '2026-03-31'), true);
      assert.equal(inRange('2026-03-31T23:59:59.999Z', '2026-03-01', '2026-03-31'), true);
      assert.equal(inRange('2026-04-01T00:00:00Z', '2026-03-01', '2026-03-31'), false);
      assert.equal(inRange('2026-02-28T23:59:59Z', '2026-03-01', '2026-03-31'), false);
    }
  }
];

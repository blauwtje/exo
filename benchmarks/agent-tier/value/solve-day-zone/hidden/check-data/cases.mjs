import assert from 'node:assert/strict';

const ZONES = ['Europe/Amsterdam', 'America/Los_Angeles', 'Pacific/Auckland', 'Asia/Kolkata', 'Pacific/Kiritimati'];

async function inEveryZone(check) {
  const original = process.env.TZ;
  try {
    for (const zone of ZONES) {
      process.env.TZ = zone;
      await check(zone);
    }
  } finally {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  }
}

export const cases = [
  {
    name: 'evening and early-morning orders land on their UTC day in every zone',
    run: async ({ load }) => {
      const { dailyTotals } = await load('src/report.mjs');
      const orders = [
        { placedAt: '2026-03-01T00:30:00Z', amountMinor: 1 },
        { placedAt: '2026-03-01T23:30:00Z', amountMinor: 10 },
        { placedAt: '2026-03-02T00:00:00Z', amountMinor: 100 },
        { placedAt: '2026-03-02T23:59:59.999Z', amountMinor: 1000 }
      ];
      await inEveryZone((zone) => assert.deepEqual(dailyTotals(orders), { '2026-03-01': 11, '2026-03-02': 1100 }, zone));
    }
  },
  {
    name: 'weekly dates cross the spring and autumn clock changes unchanged',
    run: async ({ load }) => {
      const { weeklyDates } = await load('src/report.mjs');
      await inEveryZone((zone) => {
        assert.deepEqual(weeklyDates('2026-03-16', 4), ['2026-03-16', '2026-03-23', '2026-03-30', '2026-04-06'], zone);
        assert.deepEqual(weeklyDates('2026-10-19', 3), ['2026-10-19', '2026-10-26', '2026-11-02'], zone);
        assert.deepEqual(weeklyDates('2026-03-01', 2), ['2026-03-01', '2026-03-08'], zone);
      });
    }
  },
  {
    name: 'addDays and daysBetween are exact across clock changes and month ends',
    run: async ({ load }) => {
      const { addDays, daysBetween } = await load('src/dates.mjs');
      await inEveryZone((zone) => {
        assert.equal(daysBetween('2026-03-28', '2026-03-30'), 2, zone);
        assert.equal(daysBetween('2026-10-24', '2026-10-26'), 2, zone);
        assert.equal(daysBetween('2026-03-01', '2026-04-01'), 31, zone);
        assert.equal(daysBetween('2026-04-01', '2026-03-01'), -31, zone);
        assert.equal(addDays('2026-03-29', 1), '2026-03-30', zone);
        assert.equal(addDays('2026-10-25', -1), '2026-10-24', zone);
        assert.equal(addDays('2026-12-31', 1), '2027-01-01', zone);
        assert.equal(addDays('2028-02-28', 1), '2028-02-29', zone);
      });
    }
  },
  {
    name: 'dayKey and parseDay round-trip in every zone',
    run: async ({ load }) => {
      const { dayKey, parseDay } = await load('src/dates.mjs');
      await inEveryZone((zone) => {
        assert.equal(dayKey(new Date('2026-06-15T23:59:59Z')), '2026-06-15', zone);
        assert.equal(parseDay('2026-06-15').toISOString(), '2026-06-15T00:00:00.000Z', zone);
        assert.equal(dayKey(parseDay('2026-01-01')), '2026-01-01', zone);
      });
    }
  }
];

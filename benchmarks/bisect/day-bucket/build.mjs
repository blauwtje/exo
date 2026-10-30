import { append, buildHistory, edit } from '../lib/history.mjs';

const dest = process.argv[2];
if (!dest) throw new Error('usage: node build.mjs <dest>');

const CORE = 'src/bucket.mjs';

const bucket = `const pad = (n) => String(n).padStart(2, '0')

export function dayKey(ts) {
  const d = new Date(ts)
  return \`\${d.getUTCFullYear()}-\${pad(d.getUTCMonth() + 1)}-\${pad(d.getUTCDate())}\`
}

export function bucketByDay(events) {
  const buckets = {}
  for (const event of events) {
    const key = dayKey(event.at)
    buckets[key] = (buckets[key] ?? 0) + 1
  }
  return buckets
}
`;

const repro = `import assert from 'node:assert/strict'
import { bucketByDay } from '../src/bucket.mjs'

const events = [{ at: Date.UTC(2024, 2, 10, 1, 0) }, { at: Date.UTC(2024, 2, 10, 23, 30) }]
assert.deepEqual(bucketByDay(events), { '2024-03-10': 2 })
console.log('buckets ok')
`;

buildHistory(dest, {
  name: 'day-bucket',
  seed: 23,
  count: 90,
  base: {
    'README.md': '# day-bucket\n\nGroups activity events into per-day buckets for the dashboard.\n',
    [CORE]: bucket,
    'test/buckets.mjs': repro,
  },
  core: {
    file: CORE,
    renames: [['busiestDay', 'peakDay'], ['bucketByMonth', 'monthBuckets']],
    tweaks: [
      { subject: 'feat: export the day length', append: 'export const DAY_MS = 86400000' },
      { subject: 'feat: export the bucket unit', append: "export const BUCKET_UNIT = 'day'" },
    ],
  },
  steps: [
    {
      at: 0.08,
      subject: 'feat: add month keys',
      apply: (files) => append(files, CORE, '\nexport function monthKey(ts) {\n  const d = new Date(ts)\n  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`\n}\n'),
    },
    {
      at: 0.2,
      subject: 'feat: bucket events by month',
      apply: (files) => append(files, CORE, '\nexport function bucketByMonth(events) {\n  const buckets = {}\n  for (const event of events) {\n    const key = monthKey(event.at)\n    buckets[key] = (buckets[key] ?? 0) + 1\n  }\n  return buckets\n}\n'),
    },
    {
      at: 0.35,
      subject: 'feat: add hour keys',
      apply: (files) => append(files, CORE, '\nexport function hourKey(ts) {\n  return `${dayKey(ts)}T${pad(new Date(ts).getUTCHours())}`\n}\n'),
    },
    {
      at: 0.5,
      subject: 'feat: report the busiest day',
      apply: (files) => append(files, CORE, '\nexport function busiestDay(events) {\n  const buckets = bucketByDay(events)\n  return Object.keys(buckets).sort((a, b) => buckets[b] - buckets[a] || a.localeCompare(b))[0]\n}\n'),
    },
    {
      at: 0.62,
      subject: 'refactor: read date parts straight from Date',
      body: 'Drops the UTC prefix from every getter in the day key.',
      culprit: true,
      apply: (files) => edit(files, CORE, 'return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`', 'return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`'),
    },
    {
      at: 0.68,
      subject: 'refactor: name the zero pad helper',
      apply: (files) => edit(files, CORE, /\bpad\b/g, 'twoDigits'),
    },
    {
      at: 0.78,
      subject: 'feat: add weekday keys',
      apply: (files) => append(files, CORE, '\nexport function weekdayKey(ts) {\n  return new Date(ts).getUTCDay()\n}\n'),
    },
  ],
});

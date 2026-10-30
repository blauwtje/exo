import { append, buildHistory, edit } from '../lib/history.mjs';

const dest = process.argv[2];
if (!dest) throw new Error('usage: node build.mjs <dest>');

const CORE = 'src/csv.mjs';

const csv = `export function parseLine(line) {
  return line.split(',').map((cell) => cell.trim())
}

export function parseCsv(text) {
  return text.split('\\n').filter(Boolean).map(parseLine)
}
`;

const repro = `import assert from 'node:assert/strict'
import { parseLine } from '../src/csv.mjs'

assert.deepEqual(parseLine('a,"b,c",d'), ['a', 'b,c', 'd'])
console.log('quoted fields ok')
`;

buildHistory(dest, {
  name: 'csv-quotes',
  seed: 113,
  count: 60,
  base: {
    'README.md': '# csv-quotes\n\nSmall CSV reader used by the contact import.\n',
    [CORE]: csv,
    'test/quoted.mjs': repro,
  },
  core: {
    file: CORE,
    renames: [['columnOf', 'column'], ['rowCount', 'countRows']],
    tweaks: [
      { subject: 'feat: export the delimiter', append: "export const DELIMITER = ','" },
      { subject: 'feat: export the quote mark', append: "export const QUOTE = '\"'" },
    ],
  },
  steps: [
    {
      at: 0.1,
      subject: 'feat: turn rows into objects',
      apply: (files) => append(files, CORE, '\nexport function toObjects(rows) {\n  const [header, ...body] = rows\n  return body.map((row) => Object.fromEntries(header.map((name, i) => [name, row[i]])))\n}\n'),
    },
    {
      at: 0.2,
      subject: 'fix: accept windows line endings',
      apply: (files) => edit(files, CORE, "text.split('\\n')", 'text.split(/\\r?\\n/)'),
    },
    {
      at: 0.3,
      subject: 'feat: write rows back out',
      apply: (files) => append(files, CORE, "\nexport function stringifyRow(cells) {\n  return cells.join(',')\n}\n"),
    },
    {
      at: 0.4,
      subject: 'feat: read a single column',
      apply: (files) => append(files, CORE, '\nexport function columnOf(rows, index) {\n  return rows.map((row) => row[index])\n}\n'),
    },
    {
      at: 0.5,
      subject: 'fix: strip quotes around simple cells',
      apply: (files) => edit(files, CORE, '.map((cell) => cell.trim())', ".map((cell) => cell.trim().replace(/^\"|\"$/g, ''))"),
    },
    {
      at: 0.65,
      subject: 'feat: parse with a header row',
      apply: (files) => append(files, CORE, '\nexport function parseWithHeader(text) {\n  return toObjects(parseCsv(text))\n}\n'),
    },
    {
      at: 0.8,
      subject: 'feat: count data rows',
      apply: (files) => append(files, CORE, '\nexport function rowCount(text) {\n  return Math.max(parseCsv(text).length - 1, 0)\n}\n'),
    },
  ],
});

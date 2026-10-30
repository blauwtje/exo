import { append, buildHistory, edit } from '../lib/history.mjs';

const dest = process.argv[2];
if (!dest) throw new Error('usage: node build.mjs <dest>');

const CORE = 'src/paginate.mjs';

const paginate = `export function pageCount(total, size) {
  return Math.ceil(total / size)
}

export function paginate(items, page, size) {
  const start = (page - 1) * size
  return items.slice(start, start + size)
}

export function footer(total, page, size) {
  return \`Page \${page} of \${pageCount(total, size)}\`
}
`;

const repro = `import assert from 'node:assert/strict'
import { footer, paginate } from '../src/paginate.mjs'

assert.deepEqual(paginate([1, 2, 3, 4, 5], 2, 2), [3, 4])
assert.equal(footer(25, 1, 10), 'Page 1 of 3')
assert.equal(footer(20, 1, 10), 'Page 1 of 2')
console.log('page counts ok')
`;

buildHistory(dest, {
  name: 'page-count',
  seed: 11,
  count: 40,
  base: {
    'README.md': '# page-count\n\nPagination helpers for list views.\n\n```js\nimport { footer } from "./src/paginate.mjs"\nfooter(25, 1, 10)\n```\n',
    [CORE]: paginate,
    'test/page-count.mjs': repro,
  },
  core: {
    file: CORE,
    renames: [['clampSize', 'limitSize'], ['pageRange', 'visiblePages']],
    tweaks: [
      { subject: 'feat: export the default page size', append: 'export const DEFAULT_PAGE_SIZE = 20' },
      { subject: 'feat: export the maximum page size', append: 'export const MAX_PAGE_SIZE = 100' },
    ],
  },
  steps: [
    {
      at: 0.1,
      subject: 'feat: add page size clamp',
      apply: (files) => append(files, CORE, '\nexport function clampSize(size, max = 100) {\n  return Math.min(Math.max(size, 1), max)\n}\n'),
    },
    {
      at: 0.2,
      subject: 'feat: add page range for the pager',
      apply: (files) => append(files, CORE, '\nexport function pageRange(page, total, size, span = 2) {\n  const last = pageCount(total, size)\n  const from = Math.max(page - span, 1)\n  const to = Math.min(page + span, last)\n  const pages = []\n  for (let n = from; n <= to; n++) pages.push(n)\n  return pages\n}\n'),
    },
    {
      at: 0.5,
      subject: 'fix: treat a zero page size as one page',
      apply: (files) => edit(files, CORE, 'export function pageCount(total, size) {\n', 'export function pageCount(total, size) {\n  if (size < 1) return 1\n'),
    },
    {
      at: 0.54,
      subject: 'refactor: simplify page math',
      body: 'One expression instead of a ceil, same result for every list we render.',
      culprit: true,
      apply: (files) => edit(files, CORE, 'return Math.ceil(total / size)', 'return Math.floor(total / size) + 1'),
    },
    {
      at: 0.6,
      subject: 'refactor: name the page offset',
      apply: (files) => edit(files, CORE, 'const start = (page - 1) * size\n  return items.slice(start, start + size)', 'const offset = (page - 1) * size\n  return items.slice(offset, offset + size)'),
    },
    {
      at: 0.8,
      subject: 'fix: return an empty slice below page one',
      apply: (files) => edit(files, CORE, 'export function paginate(items, page, size) {\n', 'export function paginate(items, page, size) {\n  if (page < 1) return []\n'),
    },
  ],
});

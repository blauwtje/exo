import { append, buildHistory, edit } from '../lib/history.mjs';

const dest = process.argv[2];
if (!dest) throw new Error('usage: node build.mjs <dest>');

const CORE = 'src/list.mjs';

const list = `export function parseList(input, { sep = ',', trim = true, dropEmpty = true } = {}) {
  const parts = input.split(sep)
  const cleaned = trim ? parts.map((part) => part.trim()) : parts
  return dropEmpty ? cleaned.filter((part) => part !== '') : cleaned
}
`;

const repro = `import assert from 'node:assert/strict'
import { parseList } from '../src/list.mjs'

assert.deepEqual(parseList('a,b,c'), ['a', 'b', 'c'])
assert.deepEqual(parseList('red, green ,blue'), ['red', 'green', 'blue'])
console.log('lists ok')
`;

const culprit = `export function parseList(input, options = {}) {
  const { sep = ',', trim = false, dropEmpty = true } = options
  const parts = input.split(sep)
  const cleaned = trim ? parts.map((part) => part.trim()) : parts
  return dropEmpty ? cleaned.filter((part) => part !== '') : cleaned
}
`;

buildHistory(dest, {
  name: 'list-defaults',
  seed: 41,
  count: 60,
  base: {
    'README.md': '# list-defaults\n\nParses comma separated tag lists typed into a form field.\n',
    [CORE]: list,
    'test/list.mjs': repro,
  },
  core: {
    file: CORE,
    renames: [['mergeLists', 'unionLists'], ['listDiff', 'diffLists']],
    tweaks: [
      { subject: 'feat: export the default separator', append: "export const DEFAULT_SEPARATOR = ','" },
      { subject: 'feat: export a frozen empty list', append: 'export const EMPTY_LIST = Object.freeze([])' },
    ],
  },
  steps: [
    {
      at: 0.1,
      subject: 'feat: add list formatting',
      apply: (files) => append(files, CORE, "\nexport function formatList(items, sep = ', ') {\n  return items.join(sep)\n}\n"),
    },
    {
      at: 0.22,
      subject: 'feat: add a list diff',
      apply: (files) => append(files, CORE, '\nexport function listDiff(before, after) {\n  return {\n    added: after.filter((item) => !before.includes(item)),\n    removed: before.filter((item) => !after.includes(item)),\n  }\n}\n'),
    },
    {
      at: 0.35,
      subject: 'feat: merge lists without duplicates',
      apply: (files) => append(files, CORE, '\nexport function mergeLists(a, b) {\n  return [...new Set([...a, ...b])]\n}\n'),
    },
    {
      at: 0.47,
      subject: 'refactor: destructure options once',
      culprit: true,
      apply: (files) => edit(files, CORE, /export function parseList[\s\S]*?\n}\n/, culprit),
    },
    {
      at: 0.58,
      subject: 'feat: parse numeric lists',
      apply: (files) => append(files, CORE, '\nexport function parseNumbers(input) {\n  return parseList(input, { trim: true }).map(Number)\n}\n'),
    },
    {
      at: 0.7,
      subject: 'feat: parse one item per line',
      apply: (files) => append(files, CORE, "\nexport function parseLines(input) {\n  return parseList(input, { sep: '\\n', trim: true })\n}\n"),
    },
  ],
});

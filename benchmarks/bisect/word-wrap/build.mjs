import { append, buildHistory, edit } from '../lib/history.mjs';

const dest = process.argv[2];
if (!dest) throw new Error('usage: node build.mjs <dest>');

const CORE = 'src/wrap.mjs';

const wrap = `export function wrap(text, width) {
  const lines = []
  let line = ''
  for (const word of text.split(/\\s+/).filter(Boolean)) {
    if (line && line.length + word.length > width) {
      lines.push(line)
      line = word
    } else {
      line = line ? \`\${line} \${word}\` : word
    }
  }
  if (line) lines.push(line)
  return lines
}
`;

const repro = `import test from 'node:test'
import assert from 'node:assert/strict'
import { wrap } from '../src/wrap.mjs'

test('short text stays on one line', () => {
  assert.deepEqual(wrap('hi there', 20), ['hi there'])
})

test('no line is wider than the limit', () => {
  for (const line of wrap('the quick brown fox jumps over the lazy dog', 8)) {
    assert.ok(line.length <= 8, \`line "\${line}" is \${line.length} wide, limit 8\`)
  }
})
`;

buildHistory(dest, {
  name: 'word-wrap',
  seed: 131,
  count: 50,
  base: {
    'README.md': '# word-wrap\n\nWraps plain text to a fixed width for terminal output.\n',
    [CORE]: wrap,
    'test/wrap.test.mjs': repro,
  },
  core: {
    file: CORE,
    renames: [['indentLines', 'prefixLines'], ['lineCount', 'countLines']],
    tweaks: [
      { subject: 'feat: export the default width', append: 'export const DEFAULT_WIDTH = 80' },
      { subject: 'feat: export the tab width', append: 'export const TAB_WIDTH = 4' },
    ],
  },
  steps: [
    {
      at: 0.1,
      subject: 'feat: join wrapped lines back together',
      apply: (files) => append(files, CORE, "\nexport function unwrap(rows) {\n  return rows.join(' ')\n}\n"),
    },
    {
      at: 0.2,
      subject: 'feat: indent wrapped lines',
      apply: (files) => append(files, CORE, "\nexport function indentLines(rows, prefix = '  ') {\n  return rows.map((row) => prefix + row)\n}\n"),
    },
    {
      at: 0.35,
      subject: 'refactor: split the words once',
      apply: (files) => edit(files, CORE, 'for (const word of text.split(/\\s+/).filter(Boolean)) {', 'const words = text.split(/\\s+/).filter(Boolean)\n  for (const word of words) {'),
    },
    {
      at: 0.5,
      subject: 'feat: center wrapped lines',
      apply: (files) => append(files, CORE, '\nexport function centerLines(rows, width) {\n  return rows.map((row) => row.padStart(Math.floor((width + row.length) / 2)))\n}\n'),
    },
    {
      at: 0.65,
      subject: 'feat: count wrapped lines',
      apply: (files) => append(files, CORE, '\nexport function lineCount(text, width) {\n  return wrap(text, width).length\n}\n'),
    },
    {
      at: 0.8,
      subject: 'feat: find the longest line',
      apply: (files) => append(files, CORE, '\nexport function longestLine(rows) {\n  return rows.reduce((best, row) => Math.max(best, row.length), 0)\n}\n'),
    },
  ],
});

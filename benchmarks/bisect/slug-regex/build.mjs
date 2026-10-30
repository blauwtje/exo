import { append, buildHistory, edit } from '../lib/history.mjs';

const dest = process.argv[2];
if (!dest) throw new Error('usage: node build.mjs <dest>');

const CORE = 'src/slug.mjs';

const slug = `export function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
`;

const repro = `import assert from 'node:assert/strict'
import { slugify } from '../src/slug.mjs'

assert.equal(slugify('  Hello, World!  '), 'hello-world')
assert.equal(slugify('Release_notes: v2'), 'release-notes-v2')
console.log('slugs ok')
`;

buildHistory(dest, {
  name: 'slug-regex',
  seed: 37,
  count: 150,
  base: {
    'README.md': '# slug-regex\n\nTurns titles into URL slugs.\n\n```js\nslugify("Hello, World!") // hello-world\n```\n',
    [CORE]: slug,
    'test/slug.mjs': repro,
  },
  core: {
    file: CORE,
    renames: [['shorten', 'clip'], ['isReserved', 'reservedSlug']],
    tweaks: [
      { subject: 'feat: export the slug separator', append: "export const SLUG_SEPARATOR = '-'" },
      { subject: 'feat: export the maximum slug length', append: 'export const MAX_SLUG_LENGTH = 80' },
    ],
  },
  steps: [
    {
      at: 0.05,
      subject: 'feat: add unique slugs',
      apply: (files) => append(files, CORE, '\nexport function uniqueSlug(text, taken) {\n  const base = slugify(text)\n  let slug = base\n  for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`\n  return slug\n}\n'),
    },
    {
      at: 0.15,
      subject: 'feat: transliterate accents',
      apply: (files) => edit(files, CORE, '    .toLowerCase()\n', "    .normalize('NFD')\n    .replace(/[\\u0300-\\u036f]/g, '')\n    .toLowerCase()\n"),
    },
    {
      at: 0.3,
      subject: 'feat: add a slug shortener',
      apply: (files) => append(files, CORE, '\nexport function shorten(slug, max) {\n  return slug.slice(0, max).replace(/-+$/, \'\')\n}\n'),
    },
    {
      at: 0.4,
      subject: 'feat: reserve admin slugs',
      apply: (files) => append(files, CORE, "\nconst RESERVED = new Set(['admin', 'api'])\n\nexport function isReserved(slug) {\n  return RESERVED.has(slug)\n}\n"),
    },
    {
      at: 0.5,
      subject: 'chore: simplify slug regex',
      culprit: true,
      apply: (files) => edit(files, CORE, ".replace(/[^a-z0-9]+/g, '-')", ".replace(/\\W+/g, '-')"),
    },
    {
      at: 0.57,
      subject: 'refactor: extract the dash trimmer',
      apply: (files) => {
        edit(files, CORE, 'export function slugify', 'const TRIM_DASHES = /^-+|-+$/g\n\nexport function slugify');
        edit(files, CORE, ".replace(/^-+|-+$/g, '')\n}", ".replace(TRIM_DASHES, '')\n}");
      },
    },
    {
      at: 0.75,
      subject: 'feat: slugify path segments',
      apply: (files) => append(files, CORE, "\nexport function slugifyPath(path) {\n  return path.split('/').map(slugify).filter(Boolean).join('/')\n}\n"),
    },
  ],
});

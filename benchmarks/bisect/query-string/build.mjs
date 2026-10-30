import { append, buildHistory, edit } from '../lib/history.mjs';

const dest = process.argv[2];
if (!dest) throw new Error('usage: node build.mjs <dest>');

const CORE = 'src/query.mjs';

const query = `export function buildQuery(params) {
  return Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => \`\${encodeURIComponent(key)}=\${encodeURIComponent(value)}\`)
    .join('&')
}

export function parseQuery(query) {
  const result = {}
  for (const pair of query.replace(/^\\?/, '').split('&')) {
    if (!pair) continue
    const [key, value = ''] = pair.split('=')
    result[decodeURIComponent(key)] = decodeURIComponent(value)
  }
  return result
}
`;

const repro = `import assert from 'node:assert/strict'
import { buildQuery, parseQuery } from '../src/query.mjs'

assert.equal(buildQuery({ q: 'a&b=c' }), 'q=a%26b%3Dc')
assert.deepEqual(parseQuery(buildQuery({ q: 'a&b=c', page: 2 })), { q: 'a&b=c', page: '2' })
console.log('query ok')
`;

buildHistory(dest, {
  name: 'query-string',
  seed: 83,
  count: 75,
  base: {
    'README.md': '# query-string\n\nBuilds and parses URL query strings.\n',
    [CORE]: query,
    'test/query.mjs': repro,
  },
  core: {
    file: CORE,
    renames: [['appendQuery', 'addQuery'], ['hasParam', 'hasQueryParam']],
    tweaks: [
      { subject: 'feat: export the pair separator', append: "export const PAIR_SEPARATOR = '&'" },
      { subject: 'feat: export the key separator', append: "export const KEY_SEPARATOR = '='" },
    ],
  },
  steps: [
    {
      at: 0.08,
      subject: 'feat: append params to a url',
      apply: (files) => append(files, CORE, "\nexport function appendQuery(url, params) {\n  const query = buildQuery(params)\n  if (!query) return url\n  return url + (url.includes('?') ? '&' : '?') + query\n}\n"),
    },
    {
      at: 0.2,
      subject: 'feat: merge extra params into a query',
      apply: (files) => append(files, CORE, '\nexport function mergeQuery(query, extra) {\n  return buildQuery({ ...parseQuery(query), ...extra })\n}\n'),
    },
    {
      at: 0.32,
      subject: 'feat: drop keys from a query',
      apply: (files) => append(files, CORE, '\nexport function withoutKeys(query, keys) {\n  const params = parseQuery(query)\n  for (const key of keys) delete params[key]\n  return buildQuery(params)\n}\n'),
    },
    {
      at: 0.45,
      subject: 'refactor: reuse encodeURI in query builder',
      culprit: true,
      apply: (files) => edit(files, CORE, 'encodeURIComponent(value)', 'encodeURI(value)'),
    },
    {
      at: 0.55,
      subject: 'refactor: share the empty check',
      apply: (files) => {
        edit(files, CORE, '.filter(([, value]) => value !== undefined && value !== null)', '.filter(isPresent)');
        edit(files, CORE, 'export function buildQuery', 'function isPresent([, value]) {\n  return value !== undefined && value !== null\n}\n\nexport function buildQuery');
      },
    },
    {
      at: 0.7,
      subject: 'feat: check for a param',
      apply: (files) => append(files, CORE, '\nexport function hasParam(query, key) {\n  return key in parseQuery(query)\n}\n'),
    },
    {
      at: 0.82,
      subject: 'feat: compare two queries',
      apply: (files) => append(files, CORE, '\nexport function sameQuery(a, b) {\n  return buildQuery(parseQuery(a)) === buildQuery(parseQuery(b))\n}\n'),
    },
  ],
});

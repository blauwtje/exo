import { append, buildHistory, edit } from '../lib/history.mjs';

const dest = process.argv[2];
if (!dest) throw new Error('usage: node build.mjs <dest>');

const CORE = 'src/messages.mjs';

const messages = `const catalogs = {
  en: { greeting: 'Hello', farewell: 'Goodbye' },
  nl: { greeting: 'Hallo', farewell: 'Tot ziens' },
}

const cache = new Map()

export function t(key, locale = 'en') {
  const cacheKey = \`\${locale}:\${key}\`
  if (cache.has(cacheKey)) return cache.get(cacheKey)
  const text = catalogs[locale]?.[key] ?? catalogs.en[key] ?? key
  cache.set(cacheKey, text)
  return text
}

export function clearCache() {
  cache.clear()
}
`;

const repro = `import assert from 'node:assert/strict'
import { t } from '../src/messages.mjs'

assert.equal(t('greeting', 'en'), 'Hello')
assert.equal(t('greeting', 'nl'), 'Hallo')
assert.equal(t('farewell', 'nl'), 'Tot ziens')
console.log('messages ok')
`;

buildHistory(dest, {
  name: 'locale-cache',
  seed: 79,
  count: 45,
  base: {
    'README.md': '# locale-cache\n\nLooks up UI strings per locale and caches the result.\n',
    [CORE]: messages,
    'test/messages.mjs': repro,
  },
  core: {
    file: CORE,
    renames: [['clearCache', 'resetCache'], ['locales', 'supportedLocales']],
    tweaks: [
      { subject: 'feat: export the default locale', append: "export const DEFAULT_LOCALE = 'en'" },
      { subject: 'feat: export the fallback locale', append: "export const FALLBACK_LOCALE = 'en'" },
    ],
  },
  steps: [
    {
      at: 0.1,
      subject: 'feat: add a German catalog',
      apply: (files) => append(files, CORE, "\ncatalogs.de = { greeting: 'Guten Tag', farewell: 'Auf Wiedersehen' }\n"),
    },
    {
      at: 0.25,
      subject: 'feat: add a key check',
      apply: (files) => append(files, CORE, "\nexport function has(key, locale = 'en') {\n  return Boolean(catalogs[locale]?.[key] ?? catalogs.en[key])\n}\n"),
    },
    {
      at: 0.4,
      subject: 'feat: list supported locales',
      apply: (files) => append(files, CORE, '\nexport function locales() {\n  return Object.keys(catalogs)\n}\n'),
    },
    {
      at: 0.6,
      subject: 'perf: shorten cache keys',
      culprit: true,
      apply: (files) => edit(files, CORE, 'const cacheKey = `${locale}:${key}`', 'const cacheKey = key'),
    },
    {
      at: 0.72,
      subject: 'feat: translate several keys at once',
      apply: (files) => append(files, CORE, "\nexport function tAll(keys, locale = 'en') {\n  return keys.map((key) => t(key, locale))\n}\n"),
    },
  ],
});

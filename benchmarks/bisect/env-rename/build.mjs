import { append, buildHistory, edit } from '../lib/history.mjs';

const dest = process.argv[2];
if (!dest) throw new Error('usage: node build.mjs <dest>');

const CORE = 'src/settings.mjs';
const DEPLOY = 'docs/deploy.md';

const settings = `export function readSettings(env = process.env) {
  const dbUrl = env.APP_DB_URL
  if (!dbUrl) throw new Error('database url is not configured')
  return {
    dbUrl,
    poolSize: Number(env.APP_DB_POOL ?? 5),
  }
}
`;

const deploy = `# Deploying

Set these variables on the host:

- \`APP_DB_URL\`: database connection string
- \`APP_DB_POOL\`: connection pool size, defaults to 5
`;

const repro = `import assert from 'node:assert/strict'
import { readSettings } from '../src/settings.mjs'

assert.equal(readSettings().dbUrl, 'postgres://localhost/app')
console.log('settings ok')
`;

buildHistory(dest, {
  name: 'env-rename',
  seed: 101,
  count: 110,
  base: {
    'README.md': '# env-rename\n\nReads service settings from environment variables. See docs/deploy.md.\n',
    [CORE]: settings,
    [DEPLOY]: deploy,
    'test/settings.mjs': repro,
  },
  core: {
    file: CORE,
    renames: [['readLogging', 'loadLogging'], ['readCache', 'loadCache']],
    tweaks: [
      { subject: 'feat: export the default pool size', append: 'export const DEFAULT_POOL_SIZE = 5' },
      { subject: 'feat: export the default timeout', append: 'export const DEFAULT_TIMEOUT_MS = 3000' },
    ],
  },
  steps: [
    {
      at: 0.1,
      subject: 'feat: add logging settings',
      apply: (files) => append(files, CORE, "\nexport function readLogging(env = process.env) {\n  return { level: env.APP_LOG_LEVEL ?? 'info' }\n}\n"),
    },
    {
      at: 0.22,
      subject: 'docs: document the log level variable',
      apply: (files) => append(files, DEPLOY, '- `APP_LOG_LEVEL`: log level, defaults to info\n'),
    },
    {
      at: 0.35,
      subject: 'feat: add a database timeout',
      apply: (files) => edit(files, CORE, '    poolSize: Number(env.APP_DB_POOL ?? 5),\n', '    poolSize: Number(env.APP_DB_POOL ?? 5),\n    timeoutMs: Number(env.APP_DB_TIMEOUT ?? 3000),\n'),
    },
    {
      at: 0.52,
      subject: 'chore: align env var names with deploy docs',
      culprit: true,
      apply: (files) => {
        edit(files, CORE, 'env.APP_DB_URL', 'env.DATABASE_URL');
        edit(files, DEPLOY, 'APP_DB_URL', 'DATABASE_URL');
      },
    },
    {
      at: 0.6,
      subject: 'feat: add cache settings',
      apply: (files) => append(files, CORE, '\nexport function readCache(env = process.env) {\n  return { ttlSeconds: Number(env.APP_CACHE_TTL ?? 60) }\n}\n'),
    },
    {
      at: 0.72,
      subject: 'docs: note the cache variable',
      apply: (files) => append(files, DEPLOY, '- `APP_CACHE_TTL`: cache lifetime in seconds, defaults to 60\n'),
    },
    {
      at: 0.85,
      subject: 'fix: keep the pool size at least one',
      apply: (files) => edit(files, CORE, 'poolSize: Number(env.APP_DB_POOL ?? 5),', 'poolSize: Math.max(1, Number(env.APP_DB_POOL ?? 5)),'),
    },
  ],
});

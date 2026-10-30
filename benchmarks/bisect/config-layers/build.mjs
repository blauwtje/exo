import { append, buildHistory, edit } from '../lib/history.mjs';

const dest = process.argv[2];
if (!dest) throw new Error('usage: node build.mjs <dest>');

const CORE = 'src/config.mjs';

const config = `export const defaults = {
  port: 3000,
  host: 'localhost',
  logLevel: 'info',
}

export function fromEnv(env) {
  const result = {}
  if (env.APP_PORT) result.port = Number(env.APP_PORT)
  if (env.APP_HOST) result.host = env.APP_HOST
  if (env.APP_LOG_LEVEL) result.logLevel = env.APP_LOG_LEVEL
  return result
}

export function loadConfig({ file = {}, env = {} } = {}) {
  return { ...defaults, ...file, ...fromEnv(env) }
}
`;

const repro = `import assert from 'node:assert/strict'
import { loadConfig } from '../src/config.mjs'

assert.equal(loadConfig({ env: { APP_HOST: '0.0.0.0' } }).host, '0.0.0.0')
assert.equal(loadConfig({ file: { port: 8080 } }).port, 8080)
const config = loadConfig({ file: { port: 8080 }, env: { APP_PORT: '9000' } })
assert.equal(config.port, 9000)
console.log('config ok')
`;

const layered = `export function loadConfig({ file = {}, env = {} } = {}) {
  const layers = [defaults, fromEnv(env), file]
  return layers.reduce((merged, layer) => ({ ...merged, ...layer }), {})
}
`;

buildHistory(dest, {
  name: 'config-layers',
  seed: 97,
  count: 250,
  base: {
    'README.md': '# config-layers\n\nLoads service settings from defaults, a config file and the environment.\n',
    [CORE]: config,
    'test/config.mjs': repro,
  },
  core: {
    file: CORE,
    renames: [['describeConfig', 'formatConfig'], ['redact', 'maskSecrets'], ['unknownKeys', 'extraKeys'], ['validate', 'validatePort']],
    tweaks: [
      { subject: 'feat: export the env prefix', append: "export const ENV_PREFIX = 'APP_'" },
      { subject: 'feat: export the lowest port', append: 'export const MIN_PORT = 1' },
      { subject: 'feat: export the highest port', append: 'export const MAX_PORT = 65535' },
      { subject: 'feat: export the known log levels', append: "export const KNOWN_LOG_LEVELS = ['debug', 'info', 'warn', 'error']" },
      { subject: 'feat: export the config file variable', append: "export const CONFIG_FILE_VAR = 'APP_CONFIG_FILE'" },
    ],
  },
  steps: [
    {
      at: 0.04,
      subject: 'feat: add a timeout setting',
      apply: (files) => {
        edit(files, CORE, "  logLevel: 'info',\n", "  logLevel: 'info',\n  timeoutMs: 5000,\n");
        edit(files, CORE, '  return result\n', '  if (env.APP_TIMEOUT_MS) result.timeoutMs = Number(env.APP_TIMEOUT_MS)\n  return result\n');
      },
    },
    {
      at: 0.12,
      subject: 'feat: validate the port range',
      apply: (files) => append(files, CORE, '\nexport function validate(config) {\n  if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) throw new Error(`invalid port ${config.port}`)\n  return config\n}\n'),
    },
    {
      at: 0.2,
      subject: 'feat: add a TLS flag',
      apply: (files) => {
        edit(files, CORE, '  timeoutMs: 5000,\n', '  timeoutMs: 5000,\n  tls: false,\n');
        edit(files, CORE, '  return result\n', "  if (env.APP_TLS) result.tls = env.APP_TLS === 'true'\n  return result\n");
      },
    },
    {
      at: 0.3,
      subject: 'refactor: freeze the defaults',
      apply: (files) => {
        edit(files, CORE, 'export const defaults = {', 'export const defaults = Object.freeze({');
        edit(files, CORE, '  tls: false,\n}', '  tls: false,\n})');
      },
    },
    {
      at: 0.45,
      subject: 'feat: describe a config on one line',
      apply: (files) => append(files, CORE, '\nexport function describeConfig(config) {\n  return Object.entries(config).map(([key, value]) => `${key}=${value}`).join(\' \')\n}\n'),
    },
    {
      at: 0.55,
      subject: 'feat: report where each setting came from',
      apply: (files) => append(files, CORE, '\nexport function configSources({ file = {}, env = {} } = {}) {\n  return { file: Object.keys(file), env: Object.keys(fromEnv(env)) }\n}\n'),
    },
    {
      at: 0.66,
      subject: 'refactor: build config from a layer list',
      body: 'Layers are applied in order, so adding one is a one-line change.',
      culprit: true,
      apply: (files) => edit(files, CORE, /export function loadConfig[\s\S]*?\n}\n/, layered),
    },
    {
      at: 0.7,
      subject: 'refactor: extract parseFlag',
      apply: (files) => {
        edit(files, CORE, "result.tls = env.APP_TLS === 'true'", 'result.tls = parseFlag(env.APP_TLS)');
        append(files, CORE, "\nfunction parseFlag(value) {\n  return value === 'true'\n}\n");
      },
    },
    {
      at: 0.78,
      subject: 'feat: redact secrets for logging',
      apply: (files) => append(files, CORE, "\nexport function redact(config, keys = ['password', 'token']) {\n  const copy = { ...config }\n  for (const key of keys) if (key in copy) copy[key] = '***'\n  return copy\n}\n"),
    },
    {
      at: 0.88,
      subject: 'feat: report unknown keys',
      apply: (files) => append(files, CORE, '\nexport function unknownKeys(config) {\n  return Object.keys(config).filter((key) => !(key in defaults))\n}\n'),
    },
  ],
});

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { BENCHMARK_CACHE_ENV, confinedClaude } from '../lib/confine-claude.mjs';

const EXPECTED = { CLAUDE_CODE_PROMPT_CACHE_TTL: '5m', CLAUDE_CODE_SUBAGENT_PROMPT_CACHE_TTL: '5m' };

function confinedEnv(platform) {
  const base = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'cache-env-'));
  try {
    const [root, tmp, configDir] = ['root', 'tmp', 'config'].map((name) => path.join(base, name));
    for (const folder of [root, tmp, configDir]) fs.mkdirSync(folder);
    return confinedClaude({ args: ['-p', 'hi'], roots: [root], tmp, platform, configDir }).env;
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
}

test('BENCHMARK_CACHE_ENV holds exactly the two 5-minute cache variables', () => {
  assert.deepEqual({ ...BENCHMARK_CACHE_ENV }, EXPECTED);
});

for (const platform of ['darwin', 'linux']) {
  test(`confinedClaude on ${platform} starts the session on the 5-minute prompt cache`, () => {
    const env = confinedEnv(platform);
    for (const [name, value] of Object.entries(EXPECTED)) assert.equal(env[name], value, name);
  });
}

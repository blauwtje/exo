// configDirectory() resolves the harness's config directory from one shared
// module, and no skill script reaches into another skill's folder for it.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { test } from 'node:test';
import { configDirectory } from '#config-directory';

const SKILLS = new URL('../skills/', import.meta.url);
const CROSS_SKILL_IMPORT = /from '\.\.\/\.\.\//;

test('configDirectory reads CLAUDE_CONFIG_DIR, then falls back to ~/.claude', () => {
  const saved = process.env.CLAUDE_CONFIG_DIR;
  try {
    process.env.CLAUDE_CONFIG_DIR = path.join(os.tmpdir(), 'exo-config');
    assert.equal(configDirectory(), path.join(os.tmpdir(), 'exo-config'));
    delete process.env.CLAUDE_CONFIG_DIR;
    assert.equal(configDirectory(), path.join(os.homedir(), '.claude'));
  } finally {
    if (saved === undefined) delete process.env.CLAUDE_CONFIG_DIR;
    else process.env.CLAUDE_CONFIG_DIR = saved;
  }
});

test('no skill script imports from another skill folder', () => {
  const offenders = [];
  for (const skill of fs.readdirSync(SKILLS, { withFileTypes: true })) {
    if (!skill.isDirectory()) continue;
    const scripts = new URL(`${skill.name}/scripts/`, SKILLS);
    if (!fs.existsSync(scripts)) continue;
    for (const file of fs.readdirSync(scripts)) {
      if (!file.endsWith('.mjs')) continue;
      const source = fs.readFileSync(new URL(file, scripts), 'utf8');
      if (CROSS_SKILL_IMPORT.test(source)) offenders.push(`skills/${skill.name}/scripts/${file}`);
    }
  }
  assert.deepEqual(offenders, []);
});

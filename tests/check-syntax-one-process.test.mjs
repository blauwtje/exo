import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { gitRepository } from './harness.mjs';

const VERIFY = pathToFileURL(path.join(import.meta.dirname, '..', 'verify')).href;

const COUNTING_RUN = `
import childProcess, { spawnSync } from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
const parses = [];
const original = childProcess.spawnSync;
childProcess.spawnSync = (command, args, options) => {
  if (Array.isArray(args) && args.includes('--check')) parses.push(args.at(-1));
  return original(command, args, options);
};
syncBuiltinESMExports();
const { checkScriptSyntax } = await import('${VERIFY}/checks/script-syntax.mjs');
const { checkSkillScripts } = await import('${VERIFY}/checks/skill-scripts.mjs');
const { createReport } = await import('${VERIFY}/report.mjs');
const { createRepository } = await import('${VERIFY}/repository.mjs');
const report = createReport();
const repository = createRepository(process.argv[1]);
checkScriptSyntax(report, repository);
checkSkillScripts(report, repository);
console.log(JSON.stringify({ parses: parses.length, counts: report.counts() }));
`;

function countedRun(root) {
  const run = spawnSync(process.execPath, ['--input-type=module', '-e', COUNTING_RUN, root], { encoding: 'utf8', timeout: 50000 });
  assert.equal(run.status, 0, run.stderr);
  return JSON.parse(run.stdout.trim().split('\n').at(-1));
}

const skillScripts = (count, extra = {}) => ({
  ...Object.fromEntries(Array.from({ length: count }, (_, index) => [`skills/build/scripts/step-${index}.mjs`, `export const step${index} = ${index};\n`])),
  ...extra
});

test('the syntax and skill-script checks parse every script without one node --check per file', async () => {
  const root = await gitRepository(skillScripts(20));
  const { parses, counts } = countedRun(root);
  assert.equal(parses, 0);
  assert.equal(counts.FAIL, 0);
});

test('a skill script that does not parse still fails both checks', async () => {
  const root = await gitRepository(skillScripts(3, { 'skills/build/scripts/broken.mjs': 'export const = ;\n' }));
  const { counts } = countedRun(root);
  assert.equal(counts.FAIL, 2);
});

test('a shebang line and a top-level await parse', async () => {
  const root = await gitRepository(skillScripts(1, {
    'skills/build/scripts/cli.mjs': '#!/usr/bin/env node\nconst value = await Promise.resolve(1);\nexport default value;\n'
  }));
  assert.equal(countedRun(root).counts.FAIL, 0);
});

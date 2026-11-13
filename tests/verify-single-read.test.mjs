import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const ROOT = path.join(import.meta.dirname, '..');
const VERIFY = pathToFileURL(path.join(ROOT, 'verify')).href;

const COUNTING_RUN = `
import fs from 'node:fs';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
let parsers = 0;
let reads = 0;
const readFile = fs.readFileSync;
fs.readFileSync = (file, ...rest) => {
  if (String(file).endsWith('a.mjs')) reads += 1;
  return readFile(file, ...rest);
};
const original = childProcess.spawnSync;
childProcess.spawnSync = (command, args, options) => {
  if (Array.isArray(args) && args.some((arg) => String(arg).endsWith('parse-scripts.mjs'))) parsers += 1;
  return original(command, args, options);
};
syncBuiltinESMExports();
const { checkScriptSyntax } = await import('${VERIFY}/checks/script-syntax.mjs');
const { checkSkillScripts } = await import('${VERIFY}/checks/skill-scripts.mjs');
const { createReport } = await import('${VERIFY}/report.mjs');
const { createRepository } = await import('${VERIFY}/repository.mjs');
const repository = createRepository(process.argv[1]);
repository.text(process.argv[1] + '/skills/build/scripts/a.mjs');
repository.text(process.argv[1] + '/skills/build/scripts/a.mjs');
const report = createReport();
checkScriptSyntax(report, repository);
checkSkillScripts(report, repository);
console.log(JSON.stringify({ parsers, reads }));
`;

test('one run parses and reads each script once across both script checks', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-single-read-'));
  for (const skill of ['build']) {
    fs.mkdirSync(path.join(root, 'skills', skill, 'scripts'), { recursive: true });
    fs.writeFileSync(path.join(root, 'skills', skill, 'SKILL.md'), '# Build\n');
    fs.writeFileSync(path.join(root, 'skills', skill, 'scripts', 'a.mjs'), 'export const a = 1;\n');
  }
  const run = spawnSync(process.execPath, ['--input-type=module', '-e', COUNTING_RUN, root], { encoding: 'utf8', timeout: 50000 });
  assert.equal(run.status, 0, run.stderr);
  const result = JSON.parse(run.stdout.trim().split('\n').at(-1));
  assert.equal(result.parsers, 1);
  assert.equal(result.reads, 1);
});

test('the check script registers the skill graph and validate differs from check', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert.notEqual(pkg.scripts.validate, pkg.scripts.check);
  assert.equal(pkg.scripts['validate:static'], 'node verify.mjs --static');
  const verifier = fs.readFileSync(path.join(ROOT, 'verify.mjs'), 'utf8');
  assert.match(verifier, /checkSkillGraph\(report, repository\)/);
  assert.match(verifier, /checkWorktreePaths\(report, repository\)/);
});

test('the verifier registers the size cap check', () => {
  const verifier = fs.readFileSync(path.join(ROOT, 'verify.mjs'), 'utf8');
  assert.match(verifier, /checkSizeBudgets\(report, repository\)/);
});

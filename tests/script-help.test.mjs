import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { checkScriptHelp } from '../verify/checks/script-help.mjs';
import { createRepository } from '../verify/repository.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

function lines(scripts) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'script-help-'));
  fs.mkdirSync(path.join(root, 'skills', 'build', 'scripts'), { recursive: true });
  for (const [name, source] of Object.entries(scripts)) {
    fs.writeFileSync(path.join(root, 'skills', 'build', 'scripts', name), source);
  }
  const results = [];
  checkScriptHelp({ result: (status, name, detail) => results.push(`[${status}] ${name}: ${detail}`) }, createRepository(root));
  return results;
}

test('an isMain entry point with neither --help nor parseFlags usage is a FAIL naming the file', () => {
  const results = lines({ 'bare.mjs': "if (isMain(import.meta.url)) main(process.argv.slice(2));\n" });
  assert.equal(results.length, 1);
  assert.match(results[0], /^\[FAIL\] script help: skills\/build\/scripts\/bare\.mjs /);
});

test('a shebang script with no --help path fails', () => {
  const results = lines({ 'tool.mjs': '#!/usr/bin/env node\nconsole.log(1);\n' });
  assert.match(results[0], /^\[FAIL\] script help: skills\/build\/scripts\/tool\.mjs /);
});

test('a parseFlags call without usage fails, with usage passes', () => {
  const without = lines({ 'a.mjs': "if (isMain(import.meta.url)) parseFlags(argv, { plan: 'value' });\n" });
  assert.match(without[0], /^\[FAIL\]/);
  const withUsage = lines({ 'a.mjs': "if (isMain(import.meta.url)) parseFlags(argv, {\n  plan: 'value',\n}, { usage: USAGE });\n" });
  assert.deepEqual(withUsage.map((line) => line.slice(0, 6)), ['[PASS]']);
});

test('a literal --help comparison passes', () => {
  const results = lines({ 'cli.mjs': "if (isMain(import.meta.url) && process.argv[2] === '--help') usage();\n" });
  assert.deepEqual(results.map((line) => line.slice(0, 6)), ['[PASS]']);
});

test('a module that is neither shebang nor isMain is not an entry point', () => {
  const results = lines({ 'library.mjs': 'export const value = 1;\n' });
  assert.deepEqual(results.map((line) => line.slice(0, 6)), ['[PASS]']);
});

test('every entry-point script the repository ships has a --help path', () => {
  const results = [];
  checkScriptHelp({ result: (status, name, detail) => results.push(`[${status}] ${name}: ${detail}`) }, createRepository(ROOT));
  assert.deepEqual(results.map((line) => line.slice(0, 6)), ['[PASS]'], results.join('\n'));
});

test('a --help that only appears in a usage string is not a --help path', () => {
  const results = lines({ 'usage.mjs': '#!/usr/bin/env node\nconst USAGE = "usage: a.mjs [--help]";\nconsole.log(process.argv);\n' });
  assert.match(results[0], /^\[FAIL\] script help: skills\/build\/scripts\/usage\.mjs /);
});

test('a switch case on --help passes', () => {
  const results = lines({ 'switch.mjs': "#!/usr/bin/env node\nswitch (process.argv[2]) { case '--help': usage(); }\n" });
  assert.deepEqual(results.map((line) => line.slice(0, 6)), ['[PASS]']);
});

test('a comparison with --help on the left passes', () => {
  const strict = lines({ 'left.mjs': "#!/usr/bin/env node\nif ('--help' === process.argv[2]) usage();\n" });
  assert.deepEqual(strict.map((line) => line.slice(0, 6)), ['[PASS]']);
  const loose = lines({ 'left.mjs': '#!/usr/bin/env node\nif ("--help" == process.argv[2]) usage();\n' });
  assert.deepEqual(loose.map((line) => line.slice(0, 6)), ['[PASS]']);
});

test('a flag list holding --help before includes passes', () => {
  const results = lines({ 'list.mjs': "#!/usr/bin/env node\nif (['-h', '--help'].includes(process.argv[2])) usage();\n" });
  assert.deepEqual(results.map((line) => line.slice(0, 6)), ['[PASS]']);
});

test('a --help comparison inside a comment is not a --help path', () => {
  const line = lines({ 'line.mjs': "#!/usr/bin/env node\n// if (arg === '--help') usage();\nconsole.log(process.argv);\n" });
  assert.match(line[0], /^\[FAIL\]/);
  const trailing = lines({ 'trail.mjs': "#!/usr/bin/env node\nrun(); // if (arg === '--help') usage();\n" });
  assert.match(trailing[0], /^\[FAIL\]/);
  const block = lines({ 'block.mjs': "#!/usr/bin/env node\n/*\n * if (arg === '--help') usage();\n */\nrun();\n" });
  assert.match(block[0], /^\[FAIL\]/);
});

test('a block comment opener inside a string does not hide a real --help path', () => {
  const source = "#!/usr/bin/env node\nconst GLOB = 'skills/*/SKILL.md';\nif (process.argv[2] === '--help') usage();\n/** Lists skills. */\nexport function list() {}\n";
  const results = lines({ 'glob.mjs': source });
  assert.deepEqual(results.map((line) => line.slice(0, 6)), ['[PASS]']);
});

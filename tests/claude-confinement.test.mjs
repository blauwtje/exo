// Every headless `claude` run with bypassPermissions goes through
// lib/confine-claude.mjs: a tracked script outside tests/ that names
// bypassPermissions or --dangerously-skip-permissions, or starts `claude -p`
// with no explicit --permission-mode while still loading user settings (whose
// defaultMode may be bypassPermissions), fails this test by file and line.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HELPER = 'lib/confine-claude.mjs';
const SKIPPED = ['tests/', 'harnesses/codex/generated/'];
const BYPASS = /bypassPermissions|dangerously-skip-permissions/;
const JS_START = /\b(?:spawn|spawnSync|exec|execSync|execFile|execFileSync)\(\s*(['"`])claude(\1|\s)/;
const SH_START = /(?:^|[\s;&|(`'"])claude\s(?:[^;&|]*\s)?(?:-p|--print)(?:\s|$)/;
const QUOTED_PRINT = /['"`](?:-p|--print)['"`]/;
const QUOTED_MODE = /['"`]--permission-mode['"`]/;
const QUOTED_SOURCES = /['"`]--setting-sources['"`]\s*,\s*['"`]([^'"`]*)['"`]/g;
const INLINE_SOURCES = /--setting-sources[= ]+['"]?([\w,]+)/g;

const isComment = (line, shell) => (shell ? /^\s*#/ : /^\s*(?:\/\/|\/?\*)/).test(line);
const leavesOutUser = (values) => values.length > 0 && values.every((value) => !value.split(',').includes('user'));

// A shell-style command line that starts `claude -p` with no mode while still loading user settings.
function unconfinedCommand(line) {
  if (!SH_START.test(line) || line.includes('--permission-mode')) return false;
  return !leavesOutUser([...line.matchAll(INLINE_SOURCES)].map((match) => match[1]));
}

/** The offending lines of one file, `path:line: reason`. */
export function scanText(file, text) {
  if (file === HELPER) return [];
  const shell = file.endsWith('.sh');
  // Continued shell lines are read as one command, reported at its first line.
  const lines = shell ? text.replace(/\\\n/g, ' ').split('\n') : text.split('\n');
  const printRun = QUOTED_PRINT.test(text);
  const modeSet = QUOTED_MODE.test(text);
  const userLeftOut = leavesOutUser([...text.matchAll(QUOTED_SOURCES)].map((match) => match[1]));
  const found = [];
  lines.forEach((line, index) => {
    const where = `${file}:${index + 1}`;
    if (BYPASS.test(line)) {
      found.push(`${where}: names a bypass mode outside ${HELPER}`);
      return;
    }
    if (isComment(line, shell)) return;
    if (shell) {
      if (unconfinedCommand(line)) found.push(`${where}: starts claude -p with no --permission-mode while loading user settings`);
      return;
    }
    const start = line.match(JS_START);
    if (start === null || line.includes('--version')) return;
    const unconfined = start[2] === start[1] ? printRun && !modeSet && !userLeftOut : unconfinedCommand(line);
    if (unconfined) found.push(`${where}: starts claude -p with no --permission-mode while loading user settings`);
  });
  return found;
}

/** Every offending line among the tracked .mjs, .js and .sh files of the repository at `root`. */
export function scanRepository(root) {
  const files = execFileSync('git', ['-C', root, 'ls-files', '-z', '--', '*.mjs', '*.js', '*.sh'], { encoding: 'utf8' })
    .split('\0')
    .filter((file) => file !== '' && !SKIPPED.some((prefix) => file.startsWith(prefix)));
  return files.flatMap((file) => {
    const full = path.join(root, file);
    return fs.existsSync(full) ? scanText(file, fs.readFileSync(full, 'utf8')) : [];
  });
}

test('no tracked script outside the helper and tests starts claude unconfined', () => {
  const offenders = scanRepository(ROOT);
  assert.deepEqual(offenders, [], `start these runs through ${HELPER}:\n${offenders.join('\n')}`);
});

test('the scan flags planted offenders and passes confined, excluded and commented ones', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-confinement-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const files = {
    'bench/bypass.mjs': "const args = ['-p', 'x', '--permission-mode', 'bypassPermissions'];\n",
    'bench/inherit.mjs': "import { spawn } from 'node:child_process';\nconst args = ['-p', 'x'];\nspawn('claude', args);\n",
    'bench/shell-string.js': "execSync('claude -p hello --model haiku');\n",
    'bench/skip.sh': '#!/bin/sh\nclaude --dangerously-skip-permissions -p hi\n',
    'bench/print.sh': '#!/bin/sh\n# claude -p in a comment is fine\nclaude \\\n  --print hi\n',
    'bench/sources.mjs': "const args = ['-p', 'x', '--setting-sources', 'project,local'];\nspawn('claude', args);\n",
    'bench/user-sources.mjs': "const args = ['-p', 'x', '--setting-sources', 'user,project'];\nspawn('claude', args);\n",
    'bench/mode.mjs': "const args = ['-p', 'x', '--permission-mode', 'dontAsk'];\nspawn('claude', args);\n",
    'bench/version.mjs': "const args = ['-p'];\nexecFileSync('claude', ['--version']);\n",
    'bench/comment.mjs': "// one `claude -p` call per cell\n",
    'bench/sources.sh': 'claude -p hi --setting-sources project,local\n',
    [HELPER]: "const mode = 'bypassPermissions';\n",
    'tests/stub.test.mjs': "const mode = 'bypassPermissions';\n",
    'harnesses/codex/generated/x.mjs': "const mode = 'bypassPermissions';\n"
  };
  for (const [file, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), text);
  }
  execFileSync('git', ['init', '-q', root]);
  execFileSync('git', ['-C', root, 'add', '-A']);
  assert.deepEqual(scanRepository(root).map((line) => line.replace(/: .*/, '')).sort(), [
    'bench/bypass.mjs:1',
    'bench/inherit.mjs:3',
    'bench/print.sh:3',
    'bench/shell-string.js:1',
    'bench/skip.sh:2',
    'bench/user-sources.mjs:2'
  ]);
});

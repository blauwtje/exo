// edit-skills's pressure runner confines every `claude` run to its own run
// folder: on macOS a real sandbox-exec makes a stub `claude` fail with EPERM
// on a write outside that folder and under a `~/.claude`-like folder, while
// its write in its cwd succeeds; on Linux the run gets dontAsk, Edit and Write
// allows scoped to its scratch folder and Claude's sandbox settings, never
// bypassPermissions; on Windows the runner refuses; all of it lives in lib/confine-claude.mjs.

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { fixture, run } from './harness.mjs';
import { confineRefusal, confinedClaude, sandboxProfile } from '../lib/confine-claude.mjs';

const PRESSURE = fileURLToPath(new URL('../skills/edit-skills/scripts/pressure.mjs', import.meta.url));
const CANARY_TEXT = 'canary before the run\n';

// Stands in for `claude`: tries the three writes and answers with the error
// code of each, or `ok`.
const STAND_IN = [
  '#!/usr/bin/env node',
  "const fs = require('node:fs');",
  "const path = require('node:path');",
  "const attempt = (write) => { try { write(); return 'ok'; } catch (error) { return error.code; } };",
  'const outcome = {',
  "  outside: attempt(() => fs.appendFileSync(process.env.CANARY, 'written by the run\\n')),",
  "  claudeHome: attempt(() => fs.writeFileSync(path.join(process.env.FAKE_CLAUDE_HOME, 'exo-confine-canary.txt'), 'x')),",
  "  inside: attempt(() => fs.writeFileSync(path.join(process.cwd(), 'inside.txt'), 'x')),",
  '  cwd: process.cwd()',
  '};',
  "console.log(JSON.stringify({ type: 'result', result: JSON.stringify(outcome) }));"
].join('\n');

test('on macOS a run cannot write outside its run folder or under ~/.claude, and can write in its cwd', { skip: process.platform !== 'darwin' && 'sandbox-exec confinement is macOS only' }, async () => {
  const directory = await fixture();
  const bin = path.join(directory, 'bin');
  await fs.mkdir(bin);
  await fs.writeFile(path.join(bin, 'claude'), STAND_IN, { mode: 0o755 });
  const clone = path.join(directory, 'clone');
  await fs.mkdir(path.join(clone, '.claude-plugin'), { recursive: true });
  await fs.writeFile(path.join(clone, '.claude-plugin', 'plugin.json'), JSON.stringify({ name: 'fixture-plugin' }));
  await fs.writeFile(path.join(clone, '.claude-plugin', 'marketplace.json'), JSON.stringify({ name: 'fixture-market' }));
  const promptFile = path.join(directory, 'prompt.txt');
  await fs.writeFile(promptFile, 'write outside');
  const outside = await fixture();
  const canary = path.join(outside, 'canary.txt');
  await fs.writeFile(canary, CANARY_TEXT);
  const fakeClaudeHome = path.join(await fixture(), '.claude');
  await fs.mkdir(fakeClaudeHome);
  // The run folders land under a temporary directory whose name holds a quote
  // and a backslash, so a profile that quoted its path badly would not parse.
  const runs = path.join(directory, 'ru"n\\s');
  await fs.mkdir(runs);
  const out = await fixture();
  const outcome = await run(PRESSURE, ['--prompt', promptFile, '--cells', 'sonnet:high', '--plugin-dir', clone, '--out', out], {
    cwd: directory,
    env: { PATH: `${bin}${path.delimiter}${process.env.PATH}`, TMPDIR: runs, CANARY: canary, FAKE_CLAUDE_HOME: fakeClaudeHome }
  });
  assert.equal(outcome.code, 0, outcome.stderr);
  const answers = (await fs.readdir(out)).sort();
  assert.deepEqual(answers, ['sonnet-high-with-1.md', 'sonnet-high-without-1.md']);
  const realRuns = await fs.realpath(runs);
  for (const answer of answers) {
    const text = await fs.readFile(path.join(out, answer), 'utf8');
    const result = JSON.parse(text);
    assert.equal(result.outside, 'EPERM', `${answer}: ${text}`);
    assert.equal(result.claudeHome, 'EPERM', `${answer}: ${text}`);
    assert.equal(result.inside, 'ok', `${answer}: ${text}`);
    assert.ok(result.cwd.startsWith(`${realRuns}${path.sep}`), `${answer}: ${text}`);
  }
  assert.equal(await fs.readFile(canary, 'utf8'), CANARY_TEXT);
  assert.deepEqual(await fs.readdir(fakeClaudeHome), []);
});

test('the profile denies every write but each root and the shell\'s /dev nodes, quoting a quote and a backslash', () => {
  const profile = sandboxProfile(['/private/var/run "x\\y', '/private/tmp/second']);
  assert.match(profile, /^\(deny file-write\*\)$/m);
  assert.ok(profile.includes('(subpath "/private/var/run \\"x\\\\y")'), profile);
  assert.ok(profile.includes('(subpath "/private/tmp/second")'), profile);
  assert.equal((profile.match(/\(subpath /g) ?? []).length, 2, profile);
  for (const node of ['/dev/null', '/dev/zero', '/dev/tty', '/dev/dtracehelper']) assert.ok(profile.includes(`(literal "${node}")`), profile);
});

// Two roots reached through a symlink, so their realpaths differ from the given paths.
async function linkedRoots() {
  const base = await fs.realpath(await fixture());
  await fs.mkdir(path.join(base, 'real', 'scratch'), { recursive: true });
  await fs.mkdir(path.join(base, 'real', 'tmp'));
  await fs.symlink(path.join(base, 'real'), path.join(base, 'link'));
  return { real: path.join(base, 'real'), link: path.join(base, 'link') };
}

test('on macOS sandbox-exec wraps claude with bypassPermissions, the roots\' realpaths and the temporary directory inside them', async () => {
  const { real, link } = await linkedRoots();
  const settings = { enabledPlugins: { 'p@m': false } };
  const base = ['-p', 'prompt', '--model', 'haiku', '--plugin-dir', '/clone'];
  const run = confinedClaude({ args: base, roots: [`${link}/scratch`, `${link}/tmp`], cwd: `${link}/scratch`, tmp: `${link}/tmp`, settings, platform: 'darwin' });
  assert.equal(run.command, 'sandbox-exec');
  assert.equal(run.args[0], '-p');
  assert.equal(run.args[1], sandboxProfile([`${real}/scratch`, `${real}/tmp`]));
  assert.deepEqual(run.args.slice(2), ['claude', '--permission-mode', 'bypassPermissions', '--settings', JSON.stringify(settings), ...base]);
  assert.deepEqual(run.env, { TMPDIR: `${real}/tmp/`, CLAUDE_CODE_TMPDIR: `${real}/tmp` });
  assert.equal(run.cwd, `${real}/scratch`);
});

test('on macOS a run with no tmp gets a fresh temporary directory added as a writable root', async () => {
  const { real, link } = await linkedRoots();
  const run = confinedClaude({ args: ['-p', 'x'], roots: [link], platform: 'darwin' });
  const tmp = run.env.CLAUDE_CODE_TMPDIR;
  try {
    assert.ok(tmp && tmp !== real, tmp);
    assert.equal(run.args[1], sandboxProfile([real, tmp]));
    assert.equal(run.cwd, real);
    assert.ok(!run.args.includes('--settings'), run.args.join(' '));
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('on Linux the run gets dontAsk, Edit and Write scoped to its roots and Claude\'s sandbox, never bypassPermissions', async () => {
  const { real, link } = await linkedRoots();
  for (const settings of [{ enabledPlugins: { 'p@m': false } }, undefined]) {
    const base = ['-p', 'prompt', '--plugin-dir', '/clone'];
    const run = confinedClaude({ args: base, roots: [`${link}/scratch`, `${link}/tmp`], cwd: `${link}/scratch`, settings, platform: 'linux' });
    const args = run.args;
    assert.equal(run.command, 'claude');
    assert.deepEqual(run.env, {});
    assert.deepEqual(args.slice(-base.length), base);
    assert.ok(!args.includes('bypassPermissions'), args.join(' '));
    assert.equal(args[args.indexOf('--permission-mode') + 1], 'dontAsk');
    const allowed = args[args.indexOf('--allowedTools') + 1].split(',');
    for (const root of [`${real}/scratch`, `${real}/tmp`]) {
      assert.ok(allowed.includes(`Edit(/${root}/**)`) && allowed.includes(`Write(/${root}/**)`), allowed.join(','));
    }
    assert.ok(!allowed.includes('Edit') && !allowed.includes('Write'), allowed.join(','));
    assert.deepEqual(args.filter((_, at) => args[at - 1] === '--add-dir'), [`${real}/tmp`]);
    assert.equal(args.filter((arg) => arg === '--settings').length, 1, args.join(' '));
    const merged = JSON.parse(args[args.indexOf('--settings') + 1]);
    assert.deepEqual(merged.sandbox, { enabled: true, failIfUnavailable: true, autoAllowBashIfSandboxed: true, allowUnsandboxedCommands: false });
    assert.deepEqual(merged.enabledPlugins, settings?.enabledPlugins);
  }
});

test('on Windows the helper refuses', () => {
  assert.match(confineRefusal('win32'), /Windows/);
  assert.equal(confineRefusal('darwin'), undefined);
  assert.equal(confineRefusal('linux'), undefined);
  assert.throws(() => confinedClaude({ args: ['-p', 'x'], roots: ['C:\\run'], platform: 'win32' }), /Windows/);
});

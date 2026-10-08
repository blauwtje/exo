// edit-skills's pressure runner confines every `claude` run to its own run
// folder: on macOS a real sandbox-exec makes a stub `claude` fail with EPERM
// on a write outside that folder and under a `~/.claude`-like folder, save
// its own transcript and session-env folders, while its write in its cwd succeeds; on Linux the run gets dontAsk, Edit and Write
// allows scoped to its scratch folder, Claude's sandbox settings and no user
// settings, never bypassPermissions; on Windows the runner refuses; all of it lives in lib/confine-claude.mjs.

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { fixture, run } from './harness.mjs';
import { confineRefusal, confinedClaude, sandboxProfile, transcriptFolder } from '../lib/confine-claude.mjs';

const PRESSURE = fileURLToPath(new URL('../skills/edit-skills/scripts/pressure.mjs', import.meta.url));
const CANARY_TEXT = 'canary before the run\n';

// Stands in for `claude`: tries the writes and answers with the error
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
  "  projects: path.join(process.env.CLAUDE_CONFIG_DIR, 'projects'),",
  "  transcript: attempt(() => fs.writeFileSync(path.join(process.env.CLAUDE_CONFIG_DIR, 'projects', process.cwd().replace(/[^a-zA-Z0-9]/g, '-'), 's.jsonl'), 'x')),",
  "  otherSlug: attempt(() => fs.writeFileSync(path.join(process.env.CLAUDE_CONFIG_DIR, 'projects', 'other-slug', 's.jsonl'), 'x')),",
  "  ownSession: attempt(() => fs.writeFileSync(path.join(process.env.CLAUDE_CONFIG_DIR, 'session-env', process.argv[process.argv.indexOf('--session-id') + 1], 'hook.txt'), 'x')),",
  "  sessionEnv: attempt(() => fs.mkdtempSync(path.join(process.env.CLAUDE_CONFIG_DIR, 'session-env', 'session-'))),",
  "  otherCreate: attempt(() => fs.writeFileSync(path.join(process.env.CLAUDE_CONFIG_DIR, 'session-env', 'other-id', 'new.txt'), 'x')),",
  "  otherChange: attempt(() => fs.appendFileSync(path.join(process.env.CLAUDE_CONFIG_DIR, 'session-env', 'other-id', 'existing.txt'), 'changed')),",
  "  configRoot: attempt(() => fs.writeFileSync(path.join(process.env.CLAUDE_CONFIG_DIR, 'exo-confine-canary.txt'), 'x')),",
  '  cwd: process.cwd()',
  '};',
  "console.log(JSON.stringify({ type: 'result', result: JSON.stringify(outcome) }));"
].join('\n');

test('on macOS a run cannot write outside its run folder or under ~/.claude but its own transcript folder and session-env, and can write in its cwd', { skip: process.platform !== 'darwin' && 'sandbox-exec confinement is macOS only' }, async () => {
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
  const configDir = await fixture();
  await fs.mkdir(path.join(configDir, 'projects', 'other-slug'), { recursive: true });
  await fs.mkdir(path.join(configDir, 'session-env', 'other-id'), { recursive: true });
  await fs.writeFile(path.join(configDir, 'session-env', 'other-id', 'existing.txt'), 'kept');
  const outcome = await run(PRESSURE, ['--prompt', promptFile, '--cells', 'sonnet:high', '--plugin-dir', clone, '--out', out], {
    cwd: directory,
    env: { PATH: `${bin}${path.delimiter}${process.env.PATH}`, TMPDIR: runs, CANARY: canary, FAKE_CLAUDE_HOME: fakeClaudeHome, CLAUDE_CONFIG_DIR: configDir }
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
    assert.equal(result.transcript, 'ok', `${answer}: ${text}`);
    assert.equal(result.otherSlug, 'EPERM', `${answer}: ${text}`);
    assert.equal(result.ownSession, 'ok', `${answer}: ${text}`);
    assert.equal(result.sessionEnv, 'EPERM', `${answer}: ${text}`);
    assert.equal(result.otherCreate, 'EPERM', `${answer}: ${text}`);
    assert.equal(result.otherChange, 'EPERM', `${answer}: ${text}`);
    assert.equal(result.configRoot, 'EPERM', `${answer}: ${text}`);
    assert.ok(result.cwd.startsWith(`${realRuns}${path.sep}`), `${answer}: ${text}`);
  }
  assert.equal(await fs.readFile(canary, 'utf8'), CANARY_TEXT);
  assert.deepEqual(await fs.readdir(fakeClaudeHome), []);
  assert.deepEqual((await fs.readdir(configDir)).sort(), ['projects', 'session-env']);
  assert.deepEqual(await fs.readdir(path.join(configDir, 'projects', 'other-slug')), []);
  assert.deepEqual(await fs.readdir(path.join(configDir, 'session-env', 'other-id')), ['existing.txt']);
  assert.equal(await fs.readFile(path.join(configDir, 'session-env', 'other-id', 'existing.txt'), 'utf8'), 'kept');
  assert.equal((await fs.readdir(path.join(configDir, 'projects'))).length, 3);
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
// The exact env every confined run adds for GitHub isolation, given its two empty folders.
const githubEnv = (gh, zsh) => ({
  GH_CONFIG_DIR: gh,
  GH_TOKEN: '',
  GITHUB_TOKEN: '',
  GH_ENTERPRISE_TOKEN: '',
  GITHUB_ENTERPRISE_TOKEN: '',
  GIT_CONFIG_COUNT: '1',
  GIT_CONFIG_KEY_0: 'credential.helper',
  GIT_CONFIG_VALUE_0: '',
  GIT_TERMINAL_PROMPT: '0',
  ZDOTDIR: zsh
});

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
  const configDir = await fs.realpath(await fixture());
  const run = confinedClaude({ args: base, roots: [`${link}/scratch`, `${link}/tmp`], cwd: `${link}/scratch`, tmp: `${link}/tmp`, settings, platform: 'darwin', configDir });
  const transcripts = path.join(configDir, 'projects', `${real}/scratch`.replace(/[^a-zA-Z0-9]/g, '-'));
  const id = run.args[run.args.indexOf('--session-id') + 1];
  assert.match(id, /^[0-9a-f-]{36}$/);
  assert.equal(run.args[1], sandboxProfile([`${real}/scratch`, `${real}/tmp`, transcripts, path.join(configDir, 'session-env', id)]));
  assert.equal(run.command, 'sandbox-exec');
  assert.equal(run.args[0], '-p');
  assert.deepEqual((await fs.readdir(configDir)).sort(), ['projects', 'session-env']);
  assert.deepEqual(await fs.readdir(path.join(configDir, 'session-env')), [id]);
  assert.deepEqual(await fs.readdir(path.join(configDir, 'projects')), [path.basename(transcripts)]);
  assert.deepEqual(run.args.slice(2), ['claude', '--permission-mode', 'bypassPermissions', '--settings', JSON.stringify(settings), '--session-id', id, ...base]);
  assert.deepEqual(run.env, { TMPDIR: `${real}/tmp/`, CLAUDE_CODE_TMPDIR: `${real}/tmp`, ...githubEnv(`${real}/tmp/isolated-gh`, `${real}/tmp/isolated-zsh`) });
  assert.equal(run.cwd, `${real}/scratch`);
});

test('a run with no tmp throws on either platform and leaves no folder in the system temporary directory', async () => {
  const { link } = await linkedRoots();
  const configDir = await fs.realpath(await fixture());
  const leaked = async () => (await fs.readdir(os.tmpdir())).filter((name) => /^claude-(isolation|tmp)-/.test(name)).sort();
  const before = await leaked();
  for (const platform of ['linux', 'darwin']) {
    assert.throws(() => confinedClaude({ args: ['-p', 'x'], roots: [link], platform, configDir }), /needs a tmp directory/, platform);
  }
  assert.deepEqual(await leaked(), before);
  assert.deepEqual(await fs.readdir(configDir), []);
});

test('on Linux the run gets dontAsk, Edit and Write scoped to its roots and Claude\'s sandbox, never bypassPermissions', async () => {
  const { real, link } = await linkedRoots();
  for (const settings of [{ enabledPlugins: { 'p@m': false } }, undefined]) {
    const base = ['-p', 'prompt', '--plugin-dir', '/clone'];
    const run = confinedClaude({ args: base, roots: [`${link}/scratch`, `${link}/tmp`], cwd: `${link}/scratch`, tmp: `${link}/tmp`, settings, platform: 'linux' });
    const args = run.args;
    assert.equal(run.command, 'claude');
    assert.deepEqual(run.env, githubEnv(`${real}/tmp/isolated-gh`, `${real}/tmp/isolated-zsh`));
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
    assert.deepEqual(args.filter((_, at) => args[at - 1] === '--setting-sources'), ['project,local']);
  }
});

test('on Linux a caller\'s --setting-sources without user stays alone, and one naming user or no source, or settings with permissions, throws', async () => {
  const { link } = await linkedRoots();
  const linuxRun = (args, settings) => confinedClaude({ args, roots: [`${link}/scratch`, `${link}/tmp`], tmp: `${link}/tmp`, settings, platform: 'linux' }).args;
  for (const own of [['--setting-sources', 'project'], ['--setting-sources=project,local']]) {
    const args = linuxRun(['-p', 'x', ...own]);
    assert.equal(args.filter((arg) => arg.startsWith('--setting-sources')).length, 1, args.join(' '));
    assert.deepEqual(args.slice(-own.length), own);
  }
  for (const own of [['--setting-sources', 'user,project,local'], ['--setting-sources', 'project, user'], ['--setting-sources=user'], ['--setting-sources', ''], ['--setting-sources'], ['--setting-sources', 'local', '--setting-sources', 'user']]) {
    assert.throws(() => linuxRun(['-p', 'x', ...own]), /refusing --setting-sources/, own.join(' '));
  }
  assert.throws(() => linuxRun(['-p', 'x'], { permissions: { allow: ['Write(//**)'] } }), /settings object with permissions/);
});

test('the transcript folder is the config dir\'s projects/<slug>, every non-alphanumeric cwd character a dash, and a slug Claude Code would cut is refused', () => {
  assert.equal(transcriptFolder('/private/var/run_1/a.b', '/c'), '/c/projects/-private-var-run-1-a-b');
  assert.throws(() => transcriptFolder(`/${'x'.repeat(200)}`, '/c'), /over 200 characters/);
});

test('on macOS the transcript and the run\'s own session-env folders are the only roots added under the config dir, and Linux adds none', async () => {
  const { real } = await linkedRoots();
  const configDir = await fs.realpath(await fixture());
  const darwin = confinedClaude({ args: ['-p', 'x'], roots: [`${real}/scratch`, `${real}/tmp`], tmp: `${real}/tmp`, platform: 'darwin', configDir });
  const subpaths = [...darwin.args[1].matchAll(/\(subpath "([^"]*)"\)/g)].map((match) => match[1]);
  assert.deepEqual(subpaths.filter((root) => root.startsWith(configDir)), [transcriptFolder(`${real}/scratch`, configDir), path.join(configDir, 'session-env', darwin.args[darwin.args.indexOf('--session-id') + 1])]);
  assert.equal(subpaths.length, 4, darwin.args[1]);
  const linux = confinedClaude({ args: ['-p', 'x'], roots: [`${real}/scratch`, `${real}/tmp`], tmp: `${real}/tmp`, platform: 'linux', configDir: path.join(configDir, 'linux') });
  assert.ok(!linux.args.join(' ').includes(configDir), linux.args.join(' '));
});

test('on macOS the session-env root is the caller\'s --session-id, else its --resume id unless forked, else a fresh one added as --session-id', async () => {
  const { real } = await linkedRoots();
  const configDir = await fs.realpath(await fixture());
  const sessionEnvRoot = (args) => {
    const run = confinedClaude({ args, roots: [`${real}/scratch`], tmp: `${real}/tmp`, platform: 'darwin', configDir });
    const roots = [...run.args[1].matchAll(/\(subpath "([^"]*)"\)/g)].map((match) => match[1]).filter((root) => root.startsWith(path.join(configDir, 'session-env')));
    return { roots, args: run.args.slice(run.args.indexOf('claude') + 3) };
  };
  const own = sessionEnvRoot(['-p', 'x', '--session-id', 'abc-1']);
  assert.deepEqual(own, { roots: [path.join(configDir, 'session-env', 'abc-1')], args: ['-p', 'x', '--session-id', 'abc-1'] });
  assert.deepEqual(sessionEnvRoot(['--session-id=abc-2']).roots, [path.join(configDir, 'session-env', 'abc-2')]);
  const resumed = sessionEnvRoot(['-p', 'x', '--resume', 'abc-3']);
  assert.deepEqual(resumed, { roots: [path.join(configDir, 'session-env', 'abc-3')], args: ['-p', 'x', '--resume', 'abc-3'] });
  const forked = sessionEnvRoot(['--resume', 'abc-3', '--fork-session']);
  const fresh = forked.args[forked.args.indexOf('--session-id') + 1];
  assert.deepEqual(forked.roots, [path.join(configDir, 'session-env', fresh)]);
  assert.notEqual(fresh, 'abc-3');
  assert.throws(() => sessionEnvRoot(['--session-id', '../escape']), /not a session id/);
  assert.throws(() => sessionEnvRoot(['--session-id', 'other-1', '--session-id', 'own-1']), /repeated/);
  assert.throws(() => sessionEnvRoot(['--resume', 'other-1', '-r', 'own-1']), /repeated/);
  assert.deepEqual(sessionEnvRoot(['-r', 'abc-3']), { roots: [path.join(configDir, 'session-env', 'abc-3')], args: ['-r', 'abc-3'] });
  assert.throws(() => sessionEnvRoot(['--continue']), /--continue without --fork-session/);
  assert.throws(() => sessionEnvRoot(['-p', 'x', '-c']), /--continue without --fork-session/);
  assert.deepEqual((await fs.readdir(path.join(configDir, 'session-env'))).sort(), ['abc-1', 'abc-2', 'abc-3', fresh].sort());
});

test('on Linux the GitHub isolation folders go under the caller\'s tmp when given', async () => {
  const { real, link } = await linkedRoots();
  const run = confinedClaude({ args: ['-p', 'x'], roots: [`${link}/scratch`, `${link}/tmp`], tmp: `${link}/tmp`, platform: 'linux' });
  assert.deepEqual(run.env, githubEnv(`${real}/tmp/isolated-gh`, `${real}/tmp/isolated-zsh`));
});

test('on Windows the helper refuses', () => {
  assert.match(confineRefusal('win32'), /Windows/);
  assert.equal(confineRefusal('darwin'), undefined);
  assert.equal(confineRefusal('linux'), undefined);
  assert.throws(() => confinedClaude({ args: ['-p', 'x'], roots: ['C:\\run'], platform: 'win32' }), /Windows/);
});

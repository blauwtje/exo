// The macOS profile confinedClaude builds blocks the services a confined run
// could reach the rest of the user's session through: preferences
// (cfprefsd), launchd jobs, Apple Events and LaunchServices (`open`,
// `lsappinfo`). Each canary probe runs `/bin/sh -c` under sandbox-exec with
// that profile, never `claude`, and is undone in `finally` should it land.
// The normal-need probes show what a run relies on still works: writes and git
// in its root, the user's identity, and the keychain item Claude Code signs in
// with.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fixture } from './harness.mjs';
import { confinedClaude } from '../lib/confine-claude.mjs';

const SKIP = process.platform !== 'darwin' && 'sandbox-exec confinement is macOS only';
const PROBE_TIMEOUT_MS = 20_000;
// Variables a test runner inside a git hook may set, which would point the probe's git at another repository.
const GIT_LOCATION = ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE'];

// A writable root, the profile confinedClaude builds for it and the env it adds.
async function confinedRoot() {
  const root = await fs.realpath(await fixture());
  const run = confinedClaude({ args: [], roots: [root], tmp: root, platform: 'darwin', configDir: await fixture() });
  return { root, profile: run.args[1], env: run.env };
}

function shell(command, { profile, cwd, extraEnv } = {}) {
  const env = { ...process.env, ...extraEnv };
  for (const name of GIT_LOCATION) delete env[name];
  const [file, args] = profile === undefined ? ['/bin/sh', ['-c', command]] : ['sandbox-exec', ['-p', profile, '/bin/sh', '-c', command]];
  const outcome = spawnSync(file, args, { cwd, env, encoding: 'utf8', timeout: PROBE_TIMEOUT_MS });
  if (outcome.error) throw outcome.error;
  return { status: outcome.status, output: outcome.stdout + outcome.stderr };
}

const canaryName = () => `exo-canary-${crypto.randomBytes(6).toString('hex')}`;

test('a confined run cannot write a preferences domain', { skip: SKIP }, async () => {
  const { root, profile } = await confinedRoot();
  const domain = canaryName();
  try {
    shell(`defaults write ${domain} probe -string 1`, { profile, cwd: root });
    const read = shell(`defaults read ${domain}`);
    assert.notEqual(read.status, 0, read.output);
  } finally {
    // `defaults delete` leaves the domain's plist behind, empty.
    shell(`defaults delete ${domain}`);
    await fs.rm(path.join(os.homedir(), 'Library', 'Preferences', `${domain}.plist`), { force: true });
  }
});

test('a confined run cannot submit a launchd job', { skip: SKIP }, async () => {
  const { root, profile } = await confinedRoot();
  const label = canaryName();
  try {
    shell(`launchctl submit -l ${label} -- /usr/bin/true`, { profile, cwd: root });
    const listed = shell(`launchctl list ${label}`);
    assert.notEqual(listed.status, 0, listed.output);
  } finally {
    shell(`launchctl remove ${label}`);
  }
});

test('a confined run cannot send Finder an Apple Event', { skip: SKIP }, async () => {
  const { root, profile } = await confinedRoot();
  const sent = shell(`osascript -e 'with timeout of 5 seconds' -e 'tell application "Finder" to get name' -e 'end timeout'`, { profile, cwd: root });
  assert.notEqual(sent.status, 0, sent.output);
});

test('a confined run cannot start open', { skip: SKIP }, async () => {
  const { root, profile } = await confinedRoot();
  const opened = shell(`open -g -j -b exo.canary.${crypto.randomBytes(6).toString('hex')}`, { profile, cwd: root });
  assert.notEqual(opened.status, 0, opened.output);
  assert.match(opened.output, /Operation not permitted/);
});

test('a confined run cannot ask LaunchServices for the front application', { skip: SKIP }, async (context) => {
  const outside = shell('lsappinfo front');
  if (!/ASN:/.test(outside.output)) {
    context.skip(`lsappinfo names no front application outside the sandbox: ${outside.output.trim()}`);
    return;
  }
  const { root, profile } = await confinedRoot();
  const inside = shell('lsappinfo front', { profile, cwd: root });
  assert.doesNotMatch(inside.output, /ASN:/);
});

test('a confined run can still write and commit in its root and read the user\'s identity', { skip: SKIP }, async () => {
  const { root, profile } = await confinedRoot();
  const identity = '-c user.name=canary -c user.email=canary@example.invalid';
  const committed = shell(`echo x > probe.txt && git init -q && git add probe.txt && git ${identity} commit -qm probe && git rev-parse HEAD`, { profile, cwd: root });
  assert.equal(committed.status, 0, committed.output);
  assert.match(committed.output, /^[0-9a-f]{40}$/m);
  const user = shell(`node -e 'process.stdout.write(require("node:os").userInfo().username)'`, { profile, cwd: root });
  assert.equal(user.status, 0, user.output);
  assert.equal(user.output, shell(`node -e 'process.stdout.write(require("node:os").userInfo().username)'`).output);
});

test('a confined run reads the Claude Code keychain item as an unconfined one does', { skip: SKIP }, async (context) => {
  const lookup = 'security find-generic-password -s "Claude Code-credentials" >/dev/null';
  const outside = shell(lookup);
  if (outside.status !== 0) {
    context.skip(`no Claude Code keychain item outside the sandbox: ${outside.output.trim()}`);
    return;
  }
  const { root, profile } = await confinedRoot();
  const inside = shell(lookup, { profile, cwd: root });
  assert.equal(inside.status, outside.status, inside.output);
});

test('a confined run\'s git finds no stored credential for github.com', { skip: SKIP }, async () => {
  const { root, profile, env } = await confinedRoot();
  const confined = shell(`printf 'protocol=https\\nhost=github.com\\n\\n' | git credential fill`, { profile, cwd: root, extraEnv: env });
  assert.notEqual(confined.status, 0, confined.output);
  assert.match(confined.output, /terminal prompts disabled/);
});

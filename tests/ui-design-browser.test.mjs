// Behavioral tests for the ui-design skill scripts. No dependency beyond node:*.
// Every fixture lives under the OS temp directory and is removed afterwards;
// nothing is written inside the repository.

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import {
  BROWSER_CAPABILITIES, engineWarning, obscuraServerArguments, resolveBrowser
} from '../skills/design-ui/scripts/capture.mjs';
import { fontConfidence } from '../skills/design-ui/scripts/inspect-styles.mjs';
import { fixture, run, script, SCRIPTS } from './harness.mjs';

describe('rendered-font confidence', () => {
  const declared = {
    family: 'Tidal Serif',
    sampleSelector: ':root > body:nth-child(2)',
    declared: true,
    loadedFace: false,
    fontsCheck: false,
    metricDistinct: false
  };

  it('calls a family definite only when the platform names it', () => {
    assert.equal(fontConfidence(declared, ['Tidal Serif']), 'definite');
    assert.equal(fontConfidence(declared, ['"tidal serif"']), 'definite', 'quoting and case are not evidence');
    assert.equal(fontConfidence(declared, ['Times New Roman']), 'unknown', 'a substituted face is not the declared one');
  });

  it('never reaches definite on DOM-side channels alone', () => {
    const everyChannel = { ...declared, loadedFace: true, fontsCheck: true, metricDistinct: true };
    assert.equal(fontConfidence(everyChannel, null), 'potential');
    assert.equal(fontConfidence(everyChannel, []), 'potential', 'an empty platform-font list names nothing');
    for (const channel of ['loadedFace', 'fontsCheck', 'metricDistinct']) {
      assert.equal(fontConfidence({ ...declared, [channel]: true }, null), 'potential', channel);
    }
  });

  it('reports an unanswered declaration as unknown, not as a negative', () => {
    assert.equal(fontConfidence(declared, null), 'unknown');
  });
});

describe('unavailable browser capability', () => {
  const blindEnvironment = { UI_DESIGN_TEST_DISABLE_BROWSER_DISCOVERY: '1', CHROME_PATH: '' };

  it('reports inspect-styles as unavailable and exits 0', async () => {
    const root = await fixture();
    const result = await run(script('inspect-styles.mjs'), ['--url', 'file:///tmp/none.html'],
      { cwd: root, env: blindEnvironment });
    assert.equal(result.code, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.status, 'unavailable');
    assert.deepEqual(Object.keys(report).sort(), ['hint', 'reason', 'status']);
  });

  it('reports check-ui rendered as unavailable and exits 0', async () => {
    const root = await fixture();
    const result = await run(script('check-ui.mjs'), ['--json', '--url', 'file:///tmp/none.html'],
      { cwd: root, env: blindEnvironment });
    assert.equal(result.code, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).rendered.status, 'unavailable');
  });

  it('exits 3 from capture with the exact install-nothing sentence', async () => {
    const root = await fixture();
    const result = await run(script('capture.mjs'), ['--url', 'file:///tmp/none.html'],
      { cwd: root, env: blindEnvironment });
    assert.equal(result.code, 3);
    assert.equal(result.stderr.trim(),
      'ui-design: no browser available. Install Playwright in this project (npm i -D playwright) ' +
      'or set CHROME_PATH to a Chrome, Chromium, or Edge binary. This tool installs nothing.');
  });
});

async function withEnvironment(values, body) {
  const previous = Object.fromEntries(Object.keys(values).map((name) => [name, process.env[name]]));
  Object.assign(process.env, values);
  try {
    await body();
  } finally {
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

function withChromePath(value, body) {
  return withEnvironment({ CHROME_PATH: value }, body);
}

// A stand-in obscura on PATH: the ladder only looks it up, and a launch of it
// fails at once, like a stale binary.
async function standInObscura(root) {
  const binDirectory = path.join(root, 'bin');
  await fs.mkdir(binDirectory);
  await fs.writeFile(path.join(binDirectory, 'obscura'), '#!/bin/sh\nexit 1\n', { mode: 0o755 });
  return `${binDirectory}${path.delimiter}${process.env.PATH}`;
}

describe('browser ladder preference', () => {
  it('spells out the obscura server flags and withholds file access by default', () => {
    assert.deepEqual(obscuraServerArguments(41234, 'http://127.0.0.1:5173/'),
      ['serve', '--port', '41234', '--host', '127.0.0.1', '--allow-private-network', '--quiet']);
    assert.deepEqual(obscuraServerArguments(41234, 'file:///tmp/page.html'),
      ['serve', '--port', '41234', '--host', '127.0.0.1', '--allow-private-network', '--quiet',
        '--allow-file-access']);
    assert.deepEqual(obscuraServerArguments(41234, undefined),
      ['serve', '--port', '41234', '--host', '127.0.0.1', '--allow-private-network', '--quiet']);
  });

  it('flags obscura captures with a warning and leaves Chrome captures unflagged', () => {
    const warning = engineWarning('obscura');
    assert.match(warning, /^obscura fallback/);
    for (const feature of ['popover', '<dialog>', '<use>']) assert.ok(warning.includes(feature), feature);
    assert.equal(engineWarning('playwright'), null);
    assert.equal(engineWarning('chrome-cli'), null);
  });

  it('drives Chrome through Playwright ahead of obscura whenever a Chrome rung resolves', async (t) => {
    if (process.platform === 'win32') return t.skip('the stand-in obscura is a POSIX shell script');
    const root = await fixture();
    const chosen = path.join(root, 'chosen-browser');
    await fs.writeFile(chosen, '');
    await withEnvironment({ PATH: await standInObscura(root), CHROME_PATH: chosen }, async () => {
      const capability = await resolveBrowser({ cwd: SCRIPTS });
      if (!capability.driven) return t.skip(`no Playwright client resolves: ${capability.reason}`);
      assert.equal(capability.engine, 'playwright', capability.reason);
      assert.ok([1, 2].includes(capability.rung), `rung ${capability.rung}`);
    });
  });

  it('falls back to obscura only once every Chrome rung has failed', async (t) => {
    if (process.platform === 'win32') return t.skip('the stand-in obscura is a POSIX shell script');
    const root = await fixture();
    await withEnvironment({ PATH: await standInObscura(root) }, async () => {
      const capability = await resolveBrowser({ cwd: SCRIPTS, failedRungs: [1, 2] });
      if (!capability.driven) return t.skip(`no Playwright client resolves: ${capability.reason}`);
      assert.equal(capability.engine, 'obscura', capability.reason);
      assert.equal(capability.rung, 3);
      assert.equal(capability.executablePath, null, 'obscura is reached over CDP, not launched by path');
    });
  });

  it('drops obscura for a capability it does not have, and says which', async (t) => {
    if (process.platform === 'win32') return t.skip('the stand-in obscura is a POSIX shell script');
    const root = await fixture();
    await withEnvironment({ PATH: await standInObscura(root) }, async () => {
      const available = await resolveBrowser({ cwd: SCRIPTS, failedRungs: [1, 2] });
      if (available.engine !== 'obscura') return t.skip(`obscura is not the resolved rung: ${available.reason}`);

      for (const capability of Object.values(BROWSER_CAPABILITIES)) {
        const resolved = await resolveBrowser({ cwd: SCRIPTS, requires: [capability], failedRungs: [1, 2] });
        assert.notEqual(resolved.engine, 'obscura', `${capability} must not resolve to obscura`);
        assert.ok(resolved.attempts.some((attempt) => attempt.includes(capability)),
          `attempts should name ${capability}: ${resolved.attempts.join('; ')}`);
      }
    });
  });

  it('keeps an explicit CHROME_PATH ahead of a headless shell', async (t) => {
    const root = await fixture();
    const chosen = path.join(root, 'chosen-browser');
    await fs.writeFile(chosen, '');
    await withChromePath(chosen, async () => {
      const capability = await resolveBrowser({ cwd: SCRIPTS });
      if (capability.rung !== 2) return t.skip(`CHROME_PATH does not decide rung ${capability.rung}`);
      assert.equal(capability.executablePath, chosen);
    });
  });

  it('reports a broken CHROME_PATH whichever rung ends up running', async () => {
    await withChromePath('/nonexistent/browser-binary', async () => {
      const capability = await resolveBrowser({ cwd: SCRIPTS });
      assert.ok(
        capability.attempts.some((attempt) => attempt.includes("CHROME_PATH: '/nonexistent/browser-binary'")),
        capability.attempts.join('; '));
    });
  });

  it('falls back to obscura with a warning when Chrome fails to launch', async (t) => {
    if (process.platform === 'win32') return t.skip('the stand-in browser is a POSIX shell script');
    const root = await fixture();
    const broken = path.join(root, 'broken-browser');
    await fs.writeFile(broken, '#!/bin/sh\nexit 1\n', { mode: 0o755 });
    let first;
    let fallback;
    await withChromePath(broken, async () => {
      first = await resolveBrowser({ cwd: SCRIPTS });
      fallback = await resolveBrowser({ cwd: SCRIPTS, failedRungs: [first.rung] });
    });
    if (first.rung !== 2) return t.skip(`CHROME_PATH does not decide rung ${first.rung}`);
    if (fallback.engine !== 'obscura') return t.skip(`no obscura below Chrome: ${fallback.reason}`);

    const page = path.join(root, 'page.html');
    await fs.writeFile(page, '<!doctype html><html lang="en"><title>t</title><p>fallback</p>');
    const result = await run(script('capture.mjs'),
      ['--url', `file://${page}`, '--viewport', '320x240', '--label', 'fallback', '--out', root],
      { cwd: root, env: { CHROME_PATH: broken } });
    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stderr, /capture rung 3/, result.stderr);
    assert.match(result.stderr, /ui-design: warning: obscura fallback/, result.stderr);
    const record = JSON.parse(result.stdout.trim().split('\n')[0]);
    assert.equal(record.engine, 'obscura');
    assert.equal(record.warning, engineWarning('obscura'));
  });
});

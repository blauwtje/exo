// Behavioral tests for picks.mjs: the machine-wide log of font and accent picks
// and the counts from other projects. No dependency beyond node:*.

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fixture, run, script } from './harness.mjs';

const PICKS = script('picks.mjs');

async function record(config, project, display, body, accent) {
  return run(PICKS, ['--project', project, '--display', display, '--body', body, '--accent', accent], {
    env: { CLAUDE_CONFIG_DIR: config }
  });
}

describe('picks.mjs', () => {
  it('counts nothing for the first project and logs its picks', async () => {
    const config = await fixture();
    const result = await record(config, '/work/alpha', 'Gambetta', 'Switzer', '#C2410C');
    assert.equal(result.code, 0);
    assert.deepEqual(JSON.parse(result.stdout), { display: 0, body: 0, accent: 0 });
    const log = JSON.parse(await fs.readFile(path.join(config, 'exo', 'design-picks.json'), 'utf8'));
    assert.deepEqual(log.projects['/work/alpha'], { display: 'gambetta', body: 'switzer', accent: '#c2410c' });
  });

  it('counts a repeated pick from other projects, in either font role and across case', async () => {
    const config = await fixture();
    await record(config, '/work/alpha', 'Gambetta', 'Switzer', '#c2410c');
    await record(config, '/work/beta', 'Switzer', 'Gambetta', '#C2410C');
    const result = await record(config, '/work/gamma', '"gambetta"', 'Satoshi', '#c2410c');
    assert.deepEqual(JSON.parse(result.stdout), { display: 2, body: 0, accent: 2 });
  });

  it('never counts the project against itself on a rerun', async () => {
    const config = await fixture();
    await record(config, '/work/alpha', 'Gambetta', 'Switzer', '#c2410c');
    const result = await record(config, '/work/alpha', 'Gambetta', 'Switzer', '#c2410c');
    assert.deepEqual(JSON.parse(result.stdout), { display: 0, body: 0, accent: 0 });
    const log = JSON.parse(await fs.readFile(path.join(config, 'exo', 'design-picks.json'), 'utf8'));
    assert.equal(Object.keys(log.projects).length, 1);
  });

  it('replaces a project entry with its new picks', async () => {
    const config = await fixture();
    await record(config, '/work/alpha', 'Gambetta', 'Switzer', '#c2410c');
    await record(config, '/work/alpha', 'Zodiak', 'Switzer', '#0f766e');
    const result = await record(config, '/work/beta', 'Gambetta', 'Switzer', '#c2410c');
    assert.deepEqual(JSON.parse(result.stdout), { display: 0, body: 1, accent: 0 });
  });

  it('counts a near accent from another project in any notation, not a cyan or violet one', async () => {
    const config = await fixture();
    await record(config, '/work/alpha', 'Gambetta', 'Switzer', '#2563eb');
    await record(config, '/work/beta', 'Zodiak', 'Satoshi', '#3355dd');
    await record(config, '/work/gamma', 'Zodiak', 'Satoshi', '#42d2f0');
    await record(config, '/work/delta', 'Zodiak', 'Satoshi', '#7c3aed');
    await record(config, '/work/epsilon', 'Zodiak', 'Satoshi', 'oklch(52% 0.22 265)');
    const result = await record(config, '/work/zeta', 'Erode', 'Switzer', '#2f55e0');
    assert.deepEqual(JSON.parse(result.stdout), { display: 0, body: 1, accent: 3 });
    const cyan = await record(config, '/work/eta', 'Erode', 'Switzer', 'rgb(66 210 240)');
    assert.equal(JSON.parse(cyan.stdout).accent, 1);
  });

  it('matches two near-greys on lightness only, and an unparseable accent on its exact string', async () => {
    const config = await fixture();
    await record(config, '/work/alpha', 'Gambetta', 'Switzer', '#777');
    await record(config, '/work/beta', 'Gambetta', 'Switzer', 'Cobalt Blue');
    await record(config, '/work/omega', 'Gambetta', 'Switzer', '#c2410c');
    const grey = await record(config, '/work/gamma', 'Gambetta', 'Switzer', 'hsl(0 0% 50%)');
    assert.equal(JSON.parse(grey.stdout).accent, 1);
    const named = await record(config, '/work/delta', 'Gambetta', 'Switzer', 'cobalt blue');
    assert.equal(JSON.parse(named.stdout).accent, 1);
  });

  it('exits 2 on a missing flag', async () => {
    const config = await fixture();
    const result = await run(PICKS, ['--project', '/work/alpha'], { env: { CLAUDE_CONFIG_DIR: config } });
    assert.equal(result.code, 2);
    assert.equal(result.stdout, '');
  });

  it('exits 1 and leaves an unreadable log untouched', async () => {
    const config = await fixture();
    const file = path.join(config, 'exo', 'design-picks.json');
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, '{not json');
    const result = await record(config, '/work/alpha', 'Gambetta', 'Switzer', '#c2410c');
    assert.equal(result.code, 1);
    assert.equal(await fs.readFile(file, 'utf8'), '{not json');
  });
});

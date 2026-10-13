// Behavioral tests for the ui-design skill scripts. No dependency beyond node:*.
// Every fixture lives under the OS temp directory and is removed afterwards;
// nothing is written inside the repository.

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { ALWAYS_BLOCKING, compareFindings } from '../skills/design-ui/scripts/check-ui.mjs';
import { fixture, run, script } from './harness.mjs';

describe('check-ui.mjs comments, baseline and ignore file', () => {
  it('skips tells inside code comments and keeps line numbers', async () => {
    const root = await fixture();
    await fs.writeFile(path.join(root, 'styles.css'), [
      '/* .old { transition: all 200ms ease; }',
      '   lorem ipsum */',
      '.hero {',
      '  background: url(https://example.com/hero.png);',
      '  transition: all 200ms ease;',
      '}'
    ].join('\n'));
    await fs.writeFile(path.join(root, 'page.html'), [
      '<!-- <button onclick="save()">Lorem ipsum</button> -->',
      '<p>Opening hours</p>'
    ].join('\n'));
    await fs.writeFile(path.join(root, 'banner.tsx'), [
      '// 🎉 launch day, lorem ipsum',
      'export const Banner = () => (',
      '  <a href="https://example.com">',
      '    {/* 🎉 lorem ipsum */}',
      '    Opening hours',
      '  </a>',
      ');'
    ].join('\n'));

    const result = await run(script('check-ui.mjs'), ['--json', '--source', root]);
    assert.equal(result.code, 0, result.stderr);
    const findings = JSON.parse(result.stdout).static.findings;
    const commented = ['placeholder-copy', 'inline-event-handler', 'emoji-in-markup'];
    const leaked = findings.filter((entry) => commented.includes(entry.type));
    assert.deepEqual(leaked, []);
    const transitions = findings.filter((entry) => entry.type === 'transition-all');
    assert.deepEqual(transitions.map((entry) => entry.selector), ['styles.css:5']);
  });

  const entry = (type, selector, confidence = 'definite', measured = 'measured') =>
    ({ type, confidence, selector, measured, threshold: 'threshold', note: 'note' });

  it('compares findings by type, file and measured value, ignoring the line', () => {
    const baseline = [entry('transition-all', 'a.css:2'), entry('float-layout', 'a.css:9', 'potential')];
    const current = [
      entry('transition-all', 'a.css:5'),
      entry('transition-all', 'a.css:8'),
      entry('float-layout', 'a.css:9', 'potential'),
      entry('radial-halo', 'b.css:1', 'potential')
    ];
    const comparison = compareFindings(baseline, current);
    assert.deepEqual(comparison.counts, { before: 2, after: 4, predating: 2, new: 2, ignored: 0, blocking: 1 });
    assert.deepEqual(comparison.new.map((item) => item.selector), ['a.css:8', 'b.css:1']);
    assert.deepEqual(comparison.blocking.map((item) => item.selector), ['a.css:8']);
  });

  it('blocks every clipped or overlapping finding, including one that predates the run', () => {
    const clipped = entry('content-clipped', 'p inside div', 'potential', '12px of text below the box');
    const overlap = entry('element-overlap', 'h1 over p', 'definite', '40×12px of shared area');
    const comparison = compareFindings([clipped], [clipped, overlap]);
    assert.deepEqual(comparison.counts, { before: 1, after: 2, predating: 1, new: 1, ignored: 0, blocking: 2 });
  });

  it('blocks a predating finding of every always-blocking type', () => {
    const predating = [...ALWAYS_BLOCKING].map((type) => entry(type, `${type} target`, 'potential'));
    const comparison = compareFindings(predating, predating);
    assert.equal(comparison.counts.blocking, ALWAYS_BLOCKING.size);
  });

  it('moves an ignored finding out of the new and blocking lists with its reason', () => {
    const ignores = [{ type: 'transition-all', file: 'a.css', reason: 'vendor stylesheet' }];
    const comparison = compareFindings([], [entry('transition-all', 'a.css:3')], ignores);
    assert.deepEqual(comparison.counts, { before: 0, after: 1, predating: 0, new: 0, ignored: 1, blocking: 0 });
    assert.equal(comparison.ignored[0].reason, 'vendor stylesheet');
  });

  it('matches a rule-level finding by file for an ignore entry and by selector for the baseline, whatever its line', () => {
    const ignores = [{ type: 'cream-ground', file: 'styles.css', reason: 'brand ground' }];
    const ignored = compareFindings([], [entry('cream-ground', 'body (styles.css:4)', 'potential')], ignores);
    assert.equal(ignored.counts.ignored, 1);
    const baseline = [entry('tinted-glow', '.cta (styles.css:4)', 'potential')];
    const current = [entry('tinted-glow', '.cta (styles.css:5)', 'potential'), entry('tinted-glow', '.hero (styles.css:9)', 'potential')];
    const shifted = compareFindings(baseline, current);
    assert.deepEqual(shifted.counts, { before: 1, after: 2, predating: 1, new: 1, ignored: 0, blocking: 0 });
    assert.deepEqual(shifted.new.map((item) => item.selector), ['.hero (styles.css:9)']);
  });

  it('counts identical findings at different viewports as distinct, and matches a baseline only at its own viewport', () => {
    const at390 = { ...entry('horizontal-overflow', 'document'), viewport: '390x844' };
    const at1440 = { ...entry('horizontal-overflow', 'document'), viewport: '1440x900' };
    const same = compareFindings([at390, at1440], [at390, at1440]);
    assert.deepEqual(same.counts, { before: 2, after: 2, predating: 2, new: 0, ignored: 0, blocking: 0 });

    const mismatched = compareFindings([at390], [at1440]);
    assert.deepEqual(mismatched.new.map((item) => item.viewport), ['1440x900']);
    assert.equal(mismatched.counts.predating, 0);
  });

  it('adds a comparison against a --baseline report and still exits 0', async () => {
    const root = await fixture();
    const stylesheet = path.join(root, 'styles.css');
    await fs.writeFile(stylesheet, '.card {\n  transition: all 200ms ease;\n}\n');
    const before = await run(script('check-ui.mjs'), ['--json', '--source', root]);
    assert.equal(before.code, 0, before.stderr);
    assert.equal(JSON.parse(before.stdout).comparison, undefined);
    const baselineFile = path.join(root, 'baseline.json');
    await fs.writeFile(baselineFile, before.stdout);
    await fs.writeFile(stylesheet, '.intro {\n  margin: 0 !important;\n}\n.card {\n  transition: all 200ms ease;\n}\n');

    const after = await run(script('check-ui.mjs'), ['--json', '--source', root, '--baseline', baselineFile]);
    assert.equal(after.code, 0, after.stderr);
    const report = JSON.parse(after.stdout);
    const newTypes = report.comparison.new.map((item) => item.type);
    assert.ok(newTypes.includes('important-override'), newTypes.join(', '));
    assert.ok(!newTypes.includes('transition-all'), newTypes.join(', '));
    assert.ok(report.comparison.blocking.some((item) => item.type === 'important-override'));
    assert.equal(report.comparison.counts.before, JSON.parse(before.stdout).static.findings.length);
    assert.equal(report.comparison.counts.after, report.static.findings.length);
  });

  it('rejects a --baseline that holds no check-ui findings with exit 2', async () => {
    const root = await fixture();
    const baselineFile = path.join(root, 'baseline.json');
    await fs.writeFile(baselineFile, '{"static": {"findings": "none"}}');
    const result = await run(script('check-ui.mjs'), ['--json', '--source', root, '--baseline', baselineFile]);
    assert.equal(result.code, 2);
    assert.match(result.stderr, /--baseline/);
  });

  it('rejects a --baseline that is JSON but no check-ui report with exit 2', async () => {
    const root = await fixture();
    const baselineFile = path.join(root, 'package.json');
    await fs.writeFile(baselineFile, '{"name": "site", "version": "1.0.0"}');
    const result = await run(script('check-ui.mjs'), ['--json', '--source', root, '--baseline', baselineFile]);
    assert.equal(result.code, 2);
    assert.match(result.stderr, /--baseline holds no check-ui findings/);
  });

  async function ignoreFixture(ignoreEntries) {
    const root = await fixture();
    await fs.mkdir(path.join(root, 'docs', 'design'), { recursive: true });
    await fs.writeFile(path.join(root, 'docs', 'design', 'check-ui-ignore.json'), JSON.stringify(ignoreEntries));
    await fs.writeFile(path.join(root, 'baseline.json'), '{"static": {"status": "ok", "findings": []}}');
    await fs.writeFile(path.join(root, 'styles.css'), '.intro {\n  margin: 0 !important;\n}\n');
    return root;
  }

  it('lists a finding named in docs/design/check-ui-ignore.json as ignored', async () => {
    const root = await ignoreFixture([
      { type: 'important-override', file: 'styles.css', reason: 'vendor override the user confirmed' }
    ]);
    const result = await run(script('check-ui.mjs'), ['--json', '--source', root, '--baseline', 'baseline.json'], { cwd: root });
    assert.equal(result.code, 0, result.stderr);
    const { comparison } = JSON.parse(result.stdout);
    const ignored = comparison.ignored.map((item) => [item.type, item.reason]);
    assert.deepEqual(ignored, [['important-override', 'vendor override the user confirmed']]);
    assert.ok(!comparison.new.some((item) => item.type === 'important-override'));
    assert.ok(!comparison.blocking.some((item) => item.type === 'important-override'));
  });

  it('rejects an ignore entry without a reason, naming its index and field', async () => {
    const root = await ignoreFixture([{ type: 'important-override', file: 'styles.css' }]);
    const result = await run(script('check-ui.mjs'), ['--json', '--source', root, '--baseline', 'baseline.json'], { cwd: root });
    assert.equal(result.code, 2);
    assert.match(result.stderr, /entry 0: reason/);
  });

  it('warns about an ignore entry whose type no check reports, naming the type', async () => {
    const root = await ignoreFixture([
      { type: 'important-override', file: 'styles.css', reason: 'vendor override the user confirmed' },
      { type: 'left-accent-card', file: 'styles.css', reason: 'brand stripe' }
    ]);
    const result = await run(script('check-ui.mjs'), ['--json', '--source', root, '--baseline', 'baseline.json'], { cwd: root });
    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stderr, /entry 1: unknown type left-accent-card/);
    assert.doesNotMatch(result.stderr, /important-override/);
  });

  it('warns about an ignore entry whose file still carries a rule and its line', async () => {
    const root = await ignoreFixture([{ type: 'cream-ground', file: 'body (styles.css:4)', reason: 'brand ground' }]);
    const result = await run(script('check-ui.mjs'), ['--json', '--source', root, '--baseline', 'baseline.json'], { cwd: root });
    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stderr, /entry 0: file body \(styles\.css:4\) names a rule and its line; write styles\.css/);
  });
});

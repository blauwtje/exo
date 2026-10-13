// Behavioral tests for the ui-design skill scripts. No dependency beyond node:*.
// Every fixture lives under the OS temp directory and is removed afterwards;
// nothing is written inside the repository.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { findingsFor, ofType } from './ui-design-fixture.mjs';

describe('check-ui.mjs named anti-patterns', () => {
  it('reports a cream ground declared on body or through a ground custom property', async () => {
    const findings = await findingsFor({
      'styles.css': ':root {\n  --color-background: #faf7f2;\n}\nbody {\n  background: #f5f5dc;\n}\n'
    });
    const cream = ofType(findings, 'cream-ground');
    assert.deepEqual(cream.map((entry) => entry.measured), ['#faf7f2', '#f5f5dc']);
    assert.equal(cream[0].confidence, 'potential');
    assert.equal(cream[1].selector, 'body (styles.css:4)');
  });

  it('reports no cream ground for a white ground or a cream card', async () => {
    const findings = await findingsFor({
      'styles.css': 'body {\n  background: #ffffff;\n}\n.card {\n  background: #faf7f2;\n}\n'
    });
    assert.deepEqual(ofType(findings, 'cream-ground'), []);
  });

  it('reports the first purple color of a stylesheet once', async () => {
    const findings = await findingsFor({
      'styles.css': '.button {\n  background: #7c3aed;\n}\n.link {\n  color: #6d28d9;\n}\n'
    });
    const purple = ofType(findings, 'purple-palette');
    assert.equal(purple.length, 1);
    assert.equal(purple[0].confidence, 'potential');
    assert.equal(purple[0].selector, 'styles.css:2');
    assert.equal(purple[0].measured, '#7c3aed');
  });

  it('reports an oklch purple token and an indigo utility class', async () => {
    const findings = await findingsFor({
      'tokens.css': ':root {\n  --accent: oklch(60.6% 0.25 292.7);\n}\n',
      'page.html': '<main>\n  <a class="rounded bg-indigo-600 text-white">Start</a>\n</main>\n'
    });
    const selectors = ofType(findings, 'purple-palette').map((entry) => entry.selector).sort();
    assert.deepEqual(selectors, ['page.html:2', 'tokens.css:2']);
  });

  it('reports no purple for a blue accent', async () => {
    const findings = await findingsFor({ 'styles.css': '.button {\n  background: #2563eb;\n}\n' });
    assert.deepEqual(ofType(findings, 'purple-palette'), []);
  });

  it('reports the first neon color over a near-black ground once', async () => {
    const findings = await findingsFor({
      'styles.css': 'body {\n  background: #0a0a0a;\n}\n.accent {\n  color: #39ff14;\n}\n.link {\n  color: #22d3ee;\n}\n'
    });
    const neon = ofType(findings, 'neon-on-dark');
    assert.equal(neon.length, 1);
    assert.equal(neon[0].selector, 'styles.css:5');
    assert.equal(neon[0].measured, '#39ff14 over #0a0a0a');
  });

  it('reports no neon over a light ground with a dark foreground token', async () => {
    const findings = await findingsFor({
      'styles.css': ':root {\n  --foreground: #171717;\n}\nbody {\n  background: #ffffff;\n}\n.accent {\n  color: #39ff14;\n}\n'
    });
    assert.deepEqual(ofType(findings, 'neon-on-dark'), []);
  });

  it('reports a rounded card with a stripe on one edge, not on two', async () => {
    const findings = await findingsFor({
      'styles.css': [
        '.note {\n  border-top: 4px solid #0f766e;\n  border-radius: 12px;\n}',
        '.frame {\n  border-left: 4px solid #0f766e;\n  border-right: 4px solid #0f766e;\n  border-radius: 12px;\n}'
      ].join('\n')
    });
    const stripes = ofType(findings, 'edge-accent-card');
    assert.equal(stripes.length, 1);
    assert.equal(stripes[0].selector, '.note (styles.css:1)');
    assert.equal(stripes[0].measured, 'border-top 4px, border-radius 12px');
  });

  it('reads every corner radius of a stripe card and skips a transparent edge', async () => {
    const findings = await findingsFor({
      'styles.css': [
        '.callout {\n  border-left: 4px solid #0f766e;\n  border-radius: 0 12px 12px 0;\n}',
        '.aside {\n  border-right: 4px solid #0f766e;\n  border-radius: 12px 0 0 12px;\n}',
        '.tab {\n  border-bottom: 3px solid transparent;\n  border-radius: 8px 8px 0 0;\n}'
      ].join('\n')
    });
    const stripes = ofType(findings, 'edge-accent-card');
    assert.deepEqual(stripes.map((entry) => entry.selector), ['.callout (styles.css:1)', '.aside (styles.css:5)']);
    assert.equal(stripes[0].measured, 'border-left 4px, border-radius 12px');
  });

  it('reports a zero-offset colored glow and a wide accent-tinted shadow, not a neutral one', async () => {
    const findings = await findingsFor({
      'styles.css': [
        '.badge {\n  box-shadow: 0 0 8px rgba(34, 211, 238, 0.6);\n}',
        '.cta {\n  box-shadow: 0 10px 30px rgba(99, 102, 241, 0.35);\n}',
        '.panel {\n  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);\n}',
        '.title {\n  text-shadow: 0 0 12px #22d3ee;\n}'
      ].join('\n')
    });
    const glows = ofType(findings, 'tinted-glow');
    const selectors = glows.map((entry) => entry.selector);
    assert.deepEqual(selectors, ['.badge (styles.css:1)', '.cta (styles.css:4)', '.title (styles.css:10)']);
    assert.equal(glows[0].confidence, 'potential');
    assert.equal(glows[0].measured, 'box-shadow 0px 0px 8px rgba(34, 211, 238, 0.6)');
  });

  it('reports no tinted glow for a wide shadow tinted from the ink hue', async () => {
    const findings = await findingsFor({
      'styles.css': '.card {\n  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.12);\n}\n'
    });
    assert.deepEqual(ofType(findings, 'tinted-glow'), []);
  });

  it('reports a zero-offset halo at low blur and any saturation, not a 1px hairline', async () => {
    const findings = await findingsFor({
      'styles.css': [
        '.pulse {\n  box-shadow: 0 0 24px rgba(124, 58, 237, 0.6);\n}',
        '.ring {\n  box-shadow: 0 0 1px rgba(15, 23, 42, 0.2);\n}',
        '.soft {\n  box-shadow: 0 0 4px rgba(71, 85, 105, 0.5);\n}'
      ].join('\n')
    });
    const glows = ofType(findings, 'tinted-glow');
    assert.deepEqual(glows.map((entry) => entry.selector), ['.pulse (styles.css:1)', '.soft (styles.css:7)']);
  });

  it('judges a shadow tint the same in hsl as in rgb', async () => {
    const findings = await findingsFor({
      'styles.css': [
        '.card {\n  box-shadow: 0 8px 24px hsl(222 47% 11% / 0.12);\n}',
        '.cta {\n  box-shadow: 0 10px 30px hsl(239 84% 67% / 0.35);\n}'
      ].join('\n')
    });
    assert.deepEqual(ofType(findings, 'tinted-glow').map((entry) => entry.selector), ['.cta (styles.css:4)']);
  });

  it('reads an oklch chroma percentage with 100% as 0.4', async () => {
    const findings = await findingsFor({
      'a.css': '.card {\n  box-shadow: 0 8px 24px oklch(25% 8% 260 / 0.12);\n}\n.page {\n  color: oklch(98% 2% 290);\n}\n',
      'b.css': '.button {\n  background: oklch(55% 60% 295);\n}\n'
    });
    assert.deepEqual(ofType(findings, 'tinted-glow'), []);
    assert.deepEqual(ofType(findings, 'purple-palette').map((entry) => entry.selector), ['b.css:2']);
  });

  it('reports indigo in hex and hsl as it does in oklch', async () => {
    const findings = await findingsFor({
      'a.css': '.button {\n  background: #6366f1;\n}\n',
      'b.css': '.button {\n  background: #4f46e5;\n}\n',
      'c.css': '.button {\n  background: hsl(239 84% 67%);\n}\n',
      'd.css': '.button {\n  background: oklch(58.5% 0.233 277.1);\n}\n'
    });
    const selectors = ofType(findings, 'purple-palette').map((entry) => entry.selector).sort();
    assert.deepEqual(selectors, ['a.css:2', 'b.css:2', 'c.css:2', 'd.css:2']);
  });

  it('reports no purple for a near-white lavender tint', async () => {
    const findings = await findingsFor({ 'styles.css': 'body {\n  background: #f8f7ff;\n}\n' });
    assert.deepEqual(ofType(findings, 'purple-palette'), []);
  });

  it('reports purple once per stylesheet, at the first purple a utility or a literal sets', async () => {
    const findings = await findingsFor({
      'a.css': '.x {\n  @apply bg-violet-600;\n}\n.y {\n  color: #7c3aed;\n}\n',
      'b.css': '.y {\n  color: #7c3aed;\n}\n.x {\n  @apply bg-violet-600;\n}\n'
    });
    const selectors = ofType(findings, 'purple-palette').map((entry) => entry.selector).sort();
    assert.deepEqual(selectors, ['a.css:2', 'b.css:2']);
  });

  it('reports no neon over a translucent black overlay on a white ground', async () => {
    const findings = await findingsFor({
      'styles.css': [
        ':root {\n  --bg-overlay: rgba(0,0,0,0.5);\n  --bg: rgb(0 0 0 / 50%);\n}',
        'body {\n  background: #fff;\n}',
        '.x {\n  color: #fbbf24;\n}\n.y {\n  color: #39ff14;\n}\n'
      ].join('\n')
    });
    assert.deepEqual(ofType(findings, 'neon-on-dark'), []);
  });

  it('reads a ground only from a page-level rule and a ground-named property', async () => {
    const findings = await findingsFor({
      'a.css': ':root {\n  --code-bg: #111;\n}\nbody {\n  background: #fff;\n}\n.x {\n  color: #f59e0b;\n}\n.y {\n  color: #39ff14;\n}\n',
      'b.css': ':root {\n  --card-bg: #fffbeb;\n}\nbody {\n  background: #fff;\n}\nmain .card {\n  background: #fffbeb;\n}\n'
    });
    assert.deepEqual(ofType(findings, 'neon-on-dark'), []);
    assert.deepEqual(ofType(findings, 'cream-ground'), []);
  });

  it('reports no neon for amber, orange, yellow or red on a dark ground, and still for magenta', async () => {
    const warm = ['#f59e0b', '#fbbf24', '#f97316', '#facc15', '#ff0000'];
    const findings = await findingsFor({
      'a.css': ['body {\n  background: #0a0a0a;\n}', ...warm.map((color, index) => `.c${index} {\n  color: ${color};\n}`)].join('\n'),
      'b.css': 'body {\n  background: #0a0a0a;\n}\n.x {\n  color: #ff00ff;\n}\n'
    });
    assert.deepEqual(ofType(findings, 'neon-on-dark').map((entry) => entry.selector), ['b.css:5']);
  });
});

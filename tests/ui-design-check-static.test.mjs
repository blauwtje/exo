// Behavioral tests for the ui-design skill scripts. No dependency beyond node:*.
// Every fixture lives under the OS temp directory and is removed afterwards;
// nothing is written inside the repository.

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { DECORATIVE_TELLS, parseComputedColor } from '../skills/design-ui/scripts/check-ui.mjs';
import { fixture, run, script } from './harness.mjs';

describe('check-ui.mjs static subset', () => {
  it('finds one finding per static tell', async () => {
    const root = await fixture();
    await fs.writeFile(path.join(root, 'styles.css'), [
      '.card {',
      '  transition: all 200ms ease;',
      '  color: #ff0055 !important;',
      '}'
    ].join('\n'));
    await fs.writeFile(path.join(root, 'index.html'),
      '<button onclick="save()">Lorem ipsum dolor sit amet</button>\n');

    const result = await run(script('check-ui.mjs'), ['--json', '--source', root]);
    assert.equal(result.code, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    const types = report.static.findings.map((entry) => entry.type);
    for (const expected of ['transition-all', 'important-override', 'inline-event-handler', 'placeholder-copy']) {
      assert.equal(types.filter((type) => type === expected).length, 1, `${expected} in ${types.join(', ')}`);
    }
    assert.equal(report.rendered.status, 'unavailable');
  });

  it('reports invented people, companies, prices and social proof as potential invented-content', async () => {
    const root = await fixture();
    await fs.writeFile(path.join(root, 'index.html'), [
      '<p class="byline">Jane Doe</p>',
      '<li>Trusted by Acme and Globex</li>',
      '<span class="price">$49/mo</span>',
      '<p>Join 10,000+ happy customers, rated 4.9/5</p>',
      '<cite>Maria Lopez, CEO at Northwind</cite>',
      '<p>Tide readings every 6 minutes from 14 stations, from $24 a month.</p>'
    ].join('\n'));

    const result = await run(script('check-ui.mjs'), ['--json', '--source', root]);
    assert.equal(result.code, 0, result.stderr);
    const invented = JSON.parse(result.stdout).static.findings.filter((entry) => entry.type === 'invented-content');
    assert.deepEqual(invented.map((entry) => entry.selector).sort(),
      ['index.html:1', 'index.html:2', 'index.html:3', 'index.html:4', 'index.html:5']);
    assert.ok(invented.every((entry) => entry.confidence === 'potential'));
  });

  it('reports no finding for a clean source tree and still exits 0', async () => {
    const root = await fixture();
    await fs.writeFile(path.join(root, 'styles.css'), [
      ':root {',
      '  --accent: oklch(63% 0.19 40);',
      '}',
      '.card {',
      '  color: var(--accent);',
      '  transition: color 160ms ease;',
      '}'
    ].join('\n'));

    const result = await run(script('check-ui.mjs'), ['--json', '--source', root]);
    assert.equal(result.code, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout).static.findings, []);
  });

  it('reports a raw value in the rule right after a one-line :root token block', async () => {
    const root = await fixture();
    await fs.writeFile(path.join(root, 'styles.css'), [
      ':root { --gap: 8px; }',
      '.card {',
      '  color: #ff0055;',
      '}'
    ].join('\n'));

    const result = await run(script('check-ui.mjs'), ['--json', '--source', root]);
    assert.equal(result.code, 0, result.stderr);
    const findings = JSON.parse(result.stdout).static.findings
      .filter((entry) => entry.type === 'raw-value-in-component-rule');
    assert.deepEqual(findings.map((entry) => entry.selector), ['styles.css:3']);
  });

  async function tellsFor(stylesheet) {
    const root = await fixture();
    await fs.writeFile(path.join(root, 'styles.css'), stylesheet);
    const result = await run(script('check-ui.mjs'), ['--json', '--source', root]);
    assert.equal(result.code, 0, result.stderr);
    return JSON.parse(result.stdout).static.findings.filter((entry) => DECORATIVE_TELLS.includes(entry.type));
  }

  it('reports a font-family naming an overused family or its superfamily once', async () => {
    const tells = await tellsFor('.card {\n  font-family: "Roboto Slab", system-ui, sans-serif;\n}\n');
    assert.deepEqual(tells.map((entry) => entry.type), ['overused-font']);
    assert.equal(tells[0].confidence, 'definite');
    assert.equal(tells[0].measured, 'Roboto Slab');
  });

  it('reports transition-property: all as transition-all', async () => {
    const tells = await tellsFor('.nav a {\n  transition-property: all;\n  transition-duration: 200ms;\n}\n');
    assert.deepEqual(tells.map((entry) => entry.type), ['transition-all']);
  });

  it('reports a rounded card with a left accent bar', async () => {
    const tells = await tellsFor('.note {\n  border-left: 4px solid var(--accent);\n  border-radius: 12px;\n}\n');
    assert.deepEqual(tells.map((entry) => entry.type), ['edge-accent-card']);
    assert.equal(tells[0].confidence, 'potential');
    assert.match(tells[0].selector, /^\.note \(styles\.css:1\)$/);
  });

  async function tellsForMarkup(markup) {
    const root = await fixture();
    await fs.writeFile(path.join(root, 'page.html'), markup);
    const result = await run(script('check-ui.mjs'), ['--json', '--source', root]);
    assert.equal(result.code, 0, result.stderr);
    return JSON.parse(result.stdout).static.findings.filter((entry) => DECORATIVE_TELLS.includes(entry.type));
  }

  it('reports the default drop shadow repeated across cards once, with the count', async () => {
    const tells = await tellsFor([
      '.card-a { box-shadow: 0 1px 3px rgb(0 0 0 / 10%); }',
      '.card-b { box-shadow: 0 1px 3px rgb(0 0 0 / 10%); }',
      '.card-c { box-shadow: 0 1px 3px rgb(0 0 0 / 10%); }'
    ].join('\n'));
    assert.deepEqual(tells.map((entry) => entry.type), ['uniform-card-shadow']);
    assert.equal(tells[0].measured, '0 1px 3px rgb(0 0 0 / 10%) on 3 selectors');
  });

  it('reports gradient text once for the prefixed and unprefixed pair', async () => {
    const tells = await tellsFor([
      '.hero-title {',
      '  -webkit-background-clip: text;',
      '  background-clip: text;',
      '  color: transparent;',
      '}'
    ].join('\n'));
    assert.deepEqual(tells.map((entry) => entry.type), ['gradient-text']);
  });

  it('reports the canonical two-hue gradient ground the 60 degree gate missed', async () => {
    const tells = await tellsFor('body {\n  background: linear-gradient(to bottom right, #667eea 0%, #764ba2 100%);\n}\n');
    assert.deepEqual(tells.map((entry) => entry.type), ['aggressive-gradient-ground', 'purple-palette']);
    assert.equal(tells[0].measured, '41 degrees between the first two stops');
  });

  it('reports a two-hue gradient ground written in oklch', async () => {
    const tells = await tellsFor('body {\n  background: linear-gradient(135deg, oklch(60% 0.2 280), oklch(55% 0.18 20));\n}\n');
    assert.deepEqual(tells.map((entry) => entry.type), ['aggressive-gradient-ground', 'purple-palette']);
    assert.equal(tells[0].measured, '100 degrees between the first two stops');
  });

  it('reports no gradient ground when the two stops use different color models', async () => {
    const tells = await tellsFor('body {\n  background: linear-gradient(135deg, #667eea, oklch(55% 0.18 20));\n}\n');
    assert.deepEqual(tells, []);
  });

  it('reports no overused font for a family sitting in the fallback stack', async () => {
    const tells = await tellsFor('.body-text {\n  font-family: "Tidal Serif", system-ui, "Segoe UI", Roboto, sans-serif;\n}\n');
    assert.deepEqual(tells, []);
  });

  it('reports a kicker directly above a heading and skips one separated by siblings', async () => {
    const adjacent = await tellsForMarkup('<section>\n  <p class="eyebrow">Introducing</p>\n  <h1>The thing</h1>\n</section>\n');
    assert.deepEqual(adjacent.map((entry) => entry.type), ['kicker-above-heading']);
    const separated = await tellsForMarkup([
      '<section>',
      '  <p class="eyebrow">News</p>',
      '  <img src="a.png" alt="">',
      '  <p>Body copy here.</p>',
      '  <h2>A heading far below</h2>',
      '</section>'
    ].join('\n'));
    assert.deepEqual(separated, []);
  });

  it('ends a tag outside quotes and braces and keeps svg-icon apart from svg', async () => {
    const root = await fixture();
    await fs.writeFile(path.join(root, 'page.jsx'), [
      '<svg onClick={() => go()} viewBox="0 0 24 24"></svg>',
      '<svg-icon name="a"></svg-icon>',
      '<img alt="a > b" src="a.png" />',
      '<svg class="bare">'
    ].join('\n'));
    const result = await run(script('check-ui.mjs'), ['--json', '--source', root]);
    assert.equal(result.code, 0, result.stderr);
    const findings = JSON.parse(result.stdout).static.findings.filter((entry) => entry.type === 'svg-without-viewbox' || entry.type === 'image-without-alt');
    assert.deepEqual(findings.map((entry) => entry.selector), ['page.jsx:4']);
  });

  it('reports a centered translucent radial halo', async () => {
    const tells = await tellsFor('.halo {\n  background: radial-gradient(circle at center, rgba(96,70,240,0.3), transparent 65%);\n}\n');
    assert.deepEqual(tells.map((entry) => entry.type), ['radial-halo', 'purple-palette']);
    assert.equal(tells[0].confidence, 'potential');
  });

  it('reports a hairline border carrying a wide soft shadow', async () => {
    const tells = await tellsFor('.panel {\n  border: 1px solid #dcdcdc;\n  box-shadow: 0 6px 28px rgba(0,0,0,0.07);\n}\n');
    assert.deepEqual(tells.map((entry) => entry.type), ['thin-border-wide-shadow']);
    assert.equal(tells[0].measured, 'border 1px with 28px blur');
  });

  it('reports a hard opaque offset shadow and leaves a soft or translucent one quiet', async () => {
    const tells = await tellsFor([
      '.btn { box-shadow: 4px 4px 0 #111; }',
      '.card { box-shadow: 0 1px 2px rgb(20 20 40 / 8%), 6px 6px 0px 0 rgb(17 17 17); }',
      '.soft { box-shadow: 4px 4px 12px #111; }',
      '.ring { box-shadow: 0 0 0 3px #2244ff; }',
      '.faint { box-shadow: 3px 3px 0 rgba(0,0,0,0.3); }'
    ].join('\n'));
    assert.deepEqual(tells.filter((entry) => entry.type === 'hard-offset-shadow').map((entry) => entry.selector),
      ['.btn (styles.css:1)', '.card (styles.css:2)']);
  });

  it('reports a Tailwind arbitrary hard offset shadow in markup', async () => {
    const tells = await tellsForMarkup('<button class="shadow-[4px_4px_0_#000]">Go</button>\n<div class="shadow-[0_0_0_2px_#000]"></div>\n');
    assert.deepEqual(tells.filter((entry) => entry.type === 'hard-offset-shadow').map((entry) => entry.selector), ['page.html:1']);
  });

  it('reports emoji in markup text once per line', async () => {
    const tells = await tellsForMarkup('<ul>\n  <li>\u{1F680} Fast builds</li>\n</ul>\n');
    assert.deepEqual(tells.map((entry) => entry.type), ['emoji-in-markup']);
    assert.equal(tells[0].selector, 'page.html:2');
  });

  it('reports no tell for a stylesheet that avoids every one', async () => {
    const tells = await tellsFor([
      ':root {',
      '  --accent: oklch(63% 0.19 40);',
      '}',
      'body {',
      '  font-family: "Tidal Serif", Georgia, serif;',
      '  background: linear-gradient(180deg, #f4f4f5, #e4e4e7);',
      '}',
      '.card {',
      '  border-left: 4px solid var(--accent);',
      '  box-shadow: 0 2px 6px oklch(20% 0.05 40 / 0.2);',
      '  transition: color 160ms ease;',
      '}'
    ].join('\n'));
    assert.deepEqual(tells, []);
  });
});

describe('check-ui.mjs computed colour parsing', () => {
  const close = (actual, expected) => {
    for (const key of ['r', 'g', 'b', 'a']) {
      if (expected[key] === null) assert.equal(actual[key], null, key);
      else assert.ok(Math.abs(actual[key] - expected[key]) < 0.01, `${key}: ${actual[key]} vs ${expected[key]}`);
    }
  };

  it('reads the legacy comma form with and without alpha', () => {
    close(parseComputedColor('rgba(0, 0, 0, 0.2)'), { r: 0, g: 0, b: 0, a: 0.2 });
    close(parseComputedColor('rgb(12, 34, 56)'), { r: 12, g: 34, b: 56, a: 1 });
  });

  it('reads the space form with a number or percentage alpha', () => {
    close(parseComputedColor('rgb(0 0 0 / 0.4)'), { r: 0, g: 0, b: 0, a: 0.4 });
    close(parseComputedColor('rgb(10 20 30 / 40%)'), { r: 10, g: 20, b: 30, a: 0.4 });
  });

  it('reads percentage channels', () => {
    close(parseComputedColor('rgb(100% 50% 0% / 25%)'), { r: 255, g: 127.5, b: 0, a: 0.25 });
  });

  it('reads color(srgb) with number or percentage channels', () => {
    close(parseComputedColor('color(srgb 1 0.5 0 / 0.2)'), { r: 255, g: 127.5, b: 0, a: 0.2 });
    close(parseComputedColor('color(srgb 100% 0% 50%)'), { r: 255, g: 0, b: 127.5, a: 1 });
  });

  it('reads transparent as zero alpha', () => {
    close(parseComputedColor('transparent'), { r: 0, g: 0, b: 0, a: 0 });
  });

  it('keeps the alpha of a colour space it cannot convert', () => {
    close(parseComputedColor('oklch(0.5 0.1 200 / 0.3)'), { r: null, g: null, b: null, a: 0.3 });
    close(parseComputedColor('color(display-p3 1 0 0)'), { r: null, g: null, b: null, a: 1 });
  });

  it('returns null for a value that is no colour function', () => {
    assert.equal(parseComputedColor('currentcolor'), null);
  });
});

// Behavioral tests for the ui-design skill scripts. No dependency beyond node:*.
// Every fixture lives under the OS temp directory and is removed afterwards;
// nothing is written inside the repository.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { findingsFor, ofType } from './ui-design-fixture.mjs';

describe('check-ui.mjs named anti-patterns', () => {
  it('reports a pill-shaped button rule and three rounded-full controls in one file', async () => {
    const findings = await findingsFor({
      'styles.css': '.btn-primary {\n  border-radius: 9999px;\n}\n.avatar {\n  border-radius: 9999px;\n}\n',
      'page.html': [
        '<button class="rounded-full px-4">Save</button>',
        '<button class="rounded-full px-4">Share</button>',
        '<a class="rounded-full px-4" href="/docs">Docs</a>'
      ].join('\n')
    });
    const selectors = ofType(findings, 'pill-button').map((entry) => entry.selector).sort();
    assert.deepEqual(selectors, ['.btn-primary (styles.css:1)', 'page.html:1']);
  });

  it('reports no pill button for a button group, a CTA section or three round icon links', async () => {
    const icon = '<a class="rounded-full p-2" href="https://example.com"><svg viewBox="0 0 24 24"><path d="M0 0h24v24H0z"/></svg></a>';
    const findings = await findingsFor({
      'styles.css': '.btn-group {\n  border-radius: 9999px;\n}\n.cta-section {\n  border-radius: 9999px;\n}\n',
      'page.html': [icon, icon, icon].join('\n')
    });
    assert.deepEqual(ofType(findings, 'pill-button'), []);
    const handler = '<button className="rounded-full p-2" onClick={() => setOpen(true)}><XIcon /></button>';
    const jsx = await findingsFor({ 'toolbar.jsx': [handler, handler, handler].join('\n') });
    assert.deepEqual(ofType(jsx, 'pill-button'), []);
  });

  it('reports an overshooting curve, a bounce animation and a spring bounce, not a settling curve', async () => {
    const findings = await findingsFor({
      'styles.css': [
        '.menu {\n  transition: transform 300ms cubic-bezier(0.34, 1.56, 0.64, 1);\n}',
        '.icon {\n  animation: bounce 1s infinite;\n}',
        '.fade {\n  transition: opacity 200ms cubic-bezier(0.4, 0, 0.2, 1);\n}'
      ].join('\n'),
      'motion.js': 'export const spring = { type: "spring", bounce: 0.4 };\n'
    });
    const selectors = ofType(findings, 'bounce-easing').map((entry) => entry.selector).sort();
    assert.deepEqual(selectors, ['motion.js:1', 'styles.css:2', 'styles.css:5']);
  });

  it('reports an animation on a card rule, not on a spinner', async () => {
    const findings = await findingsFor({
      'styles.css': '.feature-card {\n  animation: fade-up 600ms ease both;\n}\n.spinner {\n  animation: spin 1s linear infinite;\n}\n'
    });
    const entrances = ofType(findings, 'card-entrance');
    assert.deepEqual(entrances.map((entry) => entry.selector), ['.feature-card (styles.css:1)']);
    assert.equal(entrances[0].measured, 'animation fade-up 600ms ease both');
  });

  it('reports no card entrance for a looping animation or a class that only contains card', async () => {
    const findings = await findingsFor({
      'styles.css': [
        '.skeleton-card {\n  animation: pulse 2s infinite;\n}',
        '.card-loader {\n  animation: spin 1s linear;\n  animation-iteration-count: infinite;\n}',
        '.scorecard {\n  animation: spin 1s linear infinite;\n}',
        '.scorecard-row {\n  animation: fade-up 600ms ease both;\n}'
      ].join('\n')
    });
    assert.deepEqual(ofType(findings, 'card-entrance'), []);
  });

  it('reports a small uppercase monospace label and a font-mono utility label, not code', async () => {
    const findings = await findingsFor({
      'styles.css': [
        '.stat-label {\n  font-family: "JetBrains Mono", monospace;\n  font-size: 0.75rem;\n  text-transform: uppercase;\n}',
        'pre code {\n  font-family: ui-monospace, monospace;\n  font-size: 0.8rem;\n}'
      ].join('\n'),
      'page.html': '<main>\n  <span class="font-mono text-xs uppercase">Latency</span>\n  <code class="font-mono text-xs">npm test</code>\n</main>\n'
    });
    const selectors = ofType(findings, 'monospace-label').map((entry) => entry.selector).sort();
    assert.deepEqual(selectors, ['.stat-label (styles.css:1)', 'page.html:2']);
  });

  it('reports a card nested in a card, not card-body or sibling cards', async () => {
    const findings = await findingsFor({
      'page.html': '<div class="card">\n<div class="feature-card">x</div></div>\n<div class="card"><div class="card-body">y</div></div>\n<div class="card">a</div><div class="card">b</div>\n'
    });
    const nested = ofType(findings, 'nested-card');
    assert.deepEqual(nested.map((entry) => entry.selector), ['page.html:2']);
    assert.equal(nested[0].confidence, 'potential');
  });

  it('counts no icon tile as a card in nested-card', async () => {
    const findings = await findingsFor({
      'page.html': '<div class="card"><div class="icon-tile"></div><div class="tile-icon"></div></div>\n'
    });
    assert.deepEqual(ofType(findings, 'nested-card'), []);
  });

  it('reports an uppercase label over a heading, not an eyebrow or an inline span', async () => {
    const findings = await findingsFor({
      'page.html': [
        '<p class="text-sm uppercase tracking-wide">New</p>', '<h2>Title</h2>',
        '<p class="eyebrow uppercase">Plans</p>', '<h2>Other</h2>',
        '<p>Read <span class="uppercase">this</span> first</p>'
      ].join('\n')
    });
    const kickers = ofType(findings, 'uppercase-kicker');
    assert.deepEqual(kickers.map((entry) => entry.selector), ['page.html:1']);
    assert.equal(kickers[0].confidence, 'potential');
  });

  it('reports three icon tiles above headings once, not two or a rounded icon link', async () => {
    const block = (name) => `<div><div class="rounded-lg bg-blue-100 p-3"><svg viewBox="0 0 24 24"><path d="M0 0"/></svg></div><h3>${name}</h3></div>`;
    const findings = await findingsFor({
      'three.html': [block('A'), block('B'), block('C')].join('\n'),
      'two.html': [block('A'), block('B')].join('\n'),
      'link.html': '<a class="rounded-full p-2" href="/x"><svg viewBox="0 0 24 24"><path d="M0 0"/></svg></a>\n'.repeat(3)
    });
    const tiles = ofType(findings, 'icon-tile-heading');
    assert.deepEqual(tiles.map((entry) => entry.selector), ['three.html:1']);
    assert.equal(tiles[0].measured, '3 icon tiles above headings');
    assert.equal(tiles[0].confidence, 'potential');
  });

  it('reports three identical rounded cards in a row, not buttons or cards with differing classes', async () => {
    const card = '<div class="rounded-xl border bg-white p-6">x</div>';
    const findings = await findingsFor({
      'row.html': `${card}\n${card}\n${card}\n`,
      'buttons.html': '<button class="rounded-full px-4">a</button>\n'.repeat(3),
      'varied.html': '<div class="card a">x</div>\n<div class="card b">y</div>\n<div class="card c">z</div>\n'
    });
    const rows = ofType(findings, 'identical-card-row');
    assert.deepEqual(rows.map((entry) => entry.selector), ['row.html:1']);
    assert.equal(rows[0].measured, '3 × div.rounded-xl.border.bg-white.p-6');
    assert.equal(rows[0].confidence, 'potential');
  });

  it('reports three numbered markers once, not inside an ol', async () => {
    const markers = '<span>01</span>\n<span>02</span>\n<span>03</span>\n';
    const findings = await findingsFor({
      'steps.html': markers,
      'list.html': `<ol>\n${markers}</ol>\n`
    });
    const found = ofType(findings, 'numbered-marker');
    assert.deepEqual(found.map((entry) => entry.selector), ['steps.html:1']);
    assert.equal(found[0].confidence, 'potential');
  });

  it('reports an em, i or italic accent in a heading, not in a paragraph or an empty icon', async () => {
    const findings = await findingsFor({
      'page.html': '<h1>Ship <em>faster</em></h1>\n<p>Be <em>kind</em></p>\n<h2><i class="fa fa-star"></i> Stars</h2>\n'
    });
    const accents = ofType(findings, 'italic-accent-heading');
    assert.deepEqual(accents.map((entry) => entry.selector), ['page.html:1']);
    assert.equal(accents[0].confidence, 'potential');
  });

  it('reports a pulsing dot in markup and a stylesheet, not a skeleton or a status dot', async () => {
    const findings = await findingsFor({
      'page.html': [
        '<span class="size-2 rounded-full bg-green-500 animate-ping"></span>',
        '<div class="animate-pulse h-4 w-full rounded"></div>',
        '<span class="size-2 rounded-full animate-ping" role="status"></span>'
      ].join('\n'),
      'styles.css': '.live-dot {\n  width: 8px;\n  border-radius: 50%;\n  animation: pulse 1s infinite;\n}\n'
    });
    const dots = ofType(findings, 'pulsing-dot').map((entry) => entry.selector).sort();
    assert.deepEqual(dots, ['.live-dot (styles.css:1)', 'page.html:1']);
    assert.ok(ofType(findings, 'pulsing-dot').every((entry) => entry.confidence === 'potential'));
  });

  it('reports each filler word in copy, not in a style body or attribute', async () => {
    const findings = await findingsFor({
      'page.html': '<h1>Unlock seamless workflows</h1>\n<style>.a { transform: none; }</style>\n<div style="transform: none">plain</div>\n'
    });
    const words = ofType(findings, 'filler-word');
    assert.deepEqual(words.map((entry) => entry.measured), ['Unlock', 'seamless']);
    assert.deepEqual(words.map((entry) => entry.selector), ['page.html:1', 'page.html:1']);
    assert.equal(words[0].confidence, 'potential');
  });

  it('reports an em dash in copy once per line, not an en dash or a comment', async () => {
    const findings = await findingsFor({
      'page.html': '<p>Fast — and simple — always</p>\n<p>Pages 1–3</p>\n<!-- a — b -->\n<p>Slow &mdash; sure</p>\n'
    });
    const dashes = ofType(findings, 'em-dash-copy');
    assert.deepEqual(dashes.map((entry) => entry.selector), ['page.html:1', 'page.html:4']);
    assert.equal(dashes[0].confidence, 'potential');
  });
});

// Behavioral tests for the ui-design skill scripts. No dependency beyond node:*.
// Every fixture lives under the OS temp directory and is removed afterwards;
// nothing is written inside the repository.

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { resolveBrowser } from '../skills/design-ui/scripts/capture.mjs';
import { decodePng, rasterize } from '../skills/design-ui/scripts/inspect-render.mjs';
import { fixture, run, script, SCRIPTS } from './harness.mjs';

const PAGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Fixture</title><style>
  :root { color-scheme: light dark; }
  body { margin: 0; background: #f4f1ea; color: #1c1a17; font: 16px/1.5 system-ui; }
  main { min-height: 1600px; padding: 24px; }
  @media (prefers-color-scheme: dark) { body { background: #10151c; color: #eef2f6; } }
</style></head>
<body><main><h1>Recovered archive</h1><p>Real copy for the fixture.</p>
<button type="button">Open the register</button></main></body></html>
`;

// No @font-face rule backs this family, so nothing can honestly report that it
// painted — the point of the grading test below.
const MISSING_FACE_PAGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Missing face</title><style>
  body { margin: 0; font-family: "NoSuchFace-ZZZ", serif; }
</style></head>
<body><main><h1>Absent family</h1><p>Copy set in a family the machine does not have.</p></main></body></html>
`;

// Two links with a genuine :focus-visible outline, plus two tabindex="-1" buttons:
// check-ui's interactiveSelector counts every <button> regardless of tabindex, but
// Tab itself skips a negative tabindex, so the focus budget (4) overshoots the
// actually tabbable controls (2). That spare budget is what lets Tab wrap all the
// way back onto link-one within a single pass. The page strips its own `#token=`
// fragment on load, same as the real app's post-login URL rewrite.
const URL_REWRITE_PAGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Rewrite</title><style>
  body { margin: 0; background: #fff; color: #111; font: 16px/1.5 system-ui; }
  a, button { display: inline-block; padding: 8px; color: #111; text-decoration: none;
    font: inherit; background: #eee; border: 1px solid #ccc; }
  a:focus-visible, button:focus-visible { outline: 3px solid #0b57d0; outline-offset: 2px; }
</style></head>
<body>
<a class="link-one" href="#main">Skip to content</a>
<a class="link-two" href="#extra">Second link</a>
<button type="button" tabindex="-1">Roving one</button>
<button type="button" tabindex="-1">Roving two</button>
<main id="main"><h1>Rewritten</h1><p>The URL loses its fragment once this loads.</p></main>
<script>
  window.addEventListener('load', () => {
    if (location.hash) history.replaceState(null, '', location.pathname + location.search);
  });
</script>
</body></html>
`;

// A full-viewport red panel that fades in from transparent over 800 ms, the
// entrance motion design-ui asks of every screen; a capture taken at load sees
// white or a pale pink instead of the red the page settles on.
const FADE_IN_PAGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Fade in</title><style>
  html, body { margin: 0; height: 100%; background: #ffffff; }
  .panel { position: fixed; inset: 0; background: #d00000; animation: enter 800ms ease-out both; }
  @keyframes enter { from { opacity: 0; } to { opacity: 1; } }
</style></head>
<body><main class="panel"></main></body></html>
`;

function meanColor(bytes) {
  const raster = rasterize(decodePng(bytes));
  const cells = raster.width * raster.height;
  const sums = [0, 0, 0];
  for (let cell = 0; cell < cells; cell += 1) {
    for (let channel = 0; channel < 3; channel += 1) sums[channel] += raster.rgb[cell * 3 + channel];
  }
  return sums.map((sum) => Math.round(sum / cells));
}

async function pageFixture() {
  const root = await fixture();
  const file = path.join(root, 'page.html');
  await fs.writeFile(file, PAGE);
  return { root, url: `file://${file}` };
}

function pngGeometry(bytes) {
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

describe('rendered capability', () => {
  it('captures exactly the requested viewport geometry', async (t) => {
    const capability = await resolveBrowser({ cwd: SCRIPTS });
    if (!capability.engine) return t.skip(`no browser capability: ${capability.reason}`);
    const { root, url } = await pageFixture();

    const viewportRun = await run(script('capture.mjs'),
      ['--url', url, '--viewport', '390x844', '--label', 'viewport', '--out', root], { cwd: root });
    assert.equal(viewportRun.code, 0, viewportRun.stderr);
    const viewportRecord = JSON.parse(viewportRun.stdout.trim().split('\n')[0]);
    const viewportGeometry = pngGeometry(await fs.readFile(viewportRecord.path));
    assert.deepEqual(viewportGeometry, { width: 390, height: 844 });
  });

  it('captures a fading-in page only once its entrance animation has settled', async (t) => {
    const capability = await resolveBrowser({ cwd: SCRIPTS });
    if (!capability.driven) return t.skip(`settling animations needs a driven browser: ${capability.reason}`);
    const root = await fixture();
    const file = path.join(root, 'fade-in.html');
    await fs.writeFile(file, FADE_IN_PAGE);

    const result = await run(script('capture.mjs'),
      ['--url', `file://${file}`, '--viewport', '390x844', '--label', 'fade', '--out', root], { cwd: root });
    assert.equal(result.code, 0, result.stderr);
    const record = JSON.parse(result.stdout.trim().split('\n')[0]);
    const [red, green, blue] = meanColor(await fs.readFile(record.path));
    assert.ok(red > 190 && green < 30 && blue < 30,
      `expected the settled #d00000 panel, captured rgb(${red}, ${green}, ${blue}) on ${record.engine}`);
  });

  it('runs two --viewport values and reports both keys under rendered.viewports', async (t) => {
    const capability = await resolveBrowser({ cwd: SCRIPTS });
    if (!capability.engine || !capability.driven) return t.skip(`no driven browser capability: ${capability.reason}`);
    const { url } = await pageFixture();

    const result = await run(script('check-ui.mjs'),
      ['--json', '--url', url, '--viewport', '390x844', '--viewport', '1440x900']);
    assert.equal(result.code, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.rendered.status, 'ok');
    assert.deepEqual(Object.keys(report.rendered.viewports).sort(), ['1440x900', '390x844']);
  });

  it('grows the image beyond the viewport under --full-page', async (t) => {
    const capability = await resolveBrowser({ cwd: SCRIPTS });
    if (!capability.driven) return t.skip(`full-page capture needs a driven browser: ${capability.reason}`);
    const { root, url } = await pageFixture();

    const fullPageRun = await run(script('capture.mjs'),
      ['--url', url, '--viewport', '390x844', '--full-page', '--label', 'full', '--out', root], { cwd: root });
    assert.equal(fullPageRun.code, 0, fullPageRun.stderr);
    const fullPageRecord = JSON.parse(fullPageRun.stdout.trim().split('\n')[0]);
    const fullPageGeometry = pngGeometry(await fs.readFile(fullPageRecord.path));
    assert.equal(fullPageGeometry.width, 390);
    assert.ok(fullPageGeometry.height >= 844, `full-page height ${fullPageGeometry.height}`);
  });

  it('keeps a full-page capture of a horizontally overflowing page and records its scroll width', async (t) => {
    const capability = await resolveBrowser({ cwd: SCRIPTS });
    if (!capability.driven) return t.skip(`full-page capture needs a driven browser: ${capability.reason}`);
    const root = await fixture();
    const file = path.join(root, 'overflow.html');
    await fs.writeFile(file, '<!doctype html><html><head><style>body { margin: 0; }</style></head>'
      + '<body><div style="width: 900px; height: 40px; background: #c00;">Too wide</div></body></html>');

    const overflowRun = await run(script('capture.mjs'),
      ['--url', `file://${file}`, '--viewport', '390x844', '--full-page', '--label', 'overflow', '--out', root],
      { cwd: root });
    assert.equal(overflowRun.code, 0, overflowRun.stderr);
    const overflowRecord = JSON.parse(overflowRun.stdout.trim().split('\n')[0]);
    const overflowGeometry = pngGeometry(await fs.readFile(overflowRecord.path));
    assert.equal(overflowRecord.width, 390);
    assert.equal(overflowRecord.scrollWidth, overflowGeometry.width);
    assert.ok(overflowGeometry.width > 390, `full-page width ${overflowGeometry.width}`);
  });

  it('blends a half-transparent border over its background before measuring contrast', async (t) => {
    const capability = await resolveBrowser({ cwd: SCRIPTS });
    if (!capability.driven) return t.skip(`no driven browser: ${capability.reason}`);
    const root = await fixture();
    const file = path.join(root, 'translucent-border.html');
    // rgba(0,0,0,0.2) blended over white is a light grey (~1.6:1), below the 3:1
    // minimum; read as opaque black it would score ~21:1 and never surface.
    await fs.writeFile(file, '<!doctype html><html><head><style>'
      + 'body { margin: 0; background: #ffffff; }'
      + 'button { border: 4px solid rgba(0, 0, 0, 0.2); background: transparent;'
      + ' width: 120px; height: 48px; font-size: 16px; }'
      + '</style></head><body><button type="button">Save</button></body></html>');

    const result = await run(script('check-ui.mjs'), ['--json', '--url', `file://${file}`, '--viewport', '1440x900']);
    assert.equal(result.code, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    const findings = report.rendered.viewports['1440x900'].findings
      .filter((entry) => entry.type === 'contrast-non-text-ui' && entry.selector === 'button');
    assert.equal(findings.length, 1, 'the translucent border should score below the 3:1 minimum');
    const measured = Number.parseFloat(findings[0].measured);
    assert.ok(measured > 1.4 && measured < 1.8, `expected the blended ratio (~1.6:1), got ${findings[0].measured}`);
  });

  it('blends half-transparent text over its background before measuring contrast', async (t) => {
    const capability = await resolveBrowser({ cwd: SCRIPTS });
    if (!capability.driven) return t.skip(`no driven browser: ${capability.reason}`);
    const root = await fixture();
    const file = path.join(root, 'translucent-text.html');
    // rgba(0,0,0,0.4) blended over white is ~2.85:1, below the 4.5:1 text minimum;
    // read as opaque black it would score ~21:1 and never surface.
    await fs.writeFile(file, '<!doctype html><html><head><style>'
      + 'body { margin: 0; background: #ffffff; font-size: 16px; }'
      + 'p { color: rgba(0, 0, 0, 0.4); }'
      + '</style></head><body><p>Translucent label text</p></body></html>');

    const result = await run(script('check-ui.mjs'), ['--json', '--url', `file://${file}`, '--viewport', '1440x900']);
    assert.equal(result.code, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    const findings = report.rendered.viewports['1440x900'].findings
      .filter((entry) => entry.type === 'contrast-normal-text' && entry.selector === 'p');
    assert.equal(findings.length, 1, 'the translucent text should score below the 4.5:1 minimum');
    assert.equal(findings[0].confidence, 'definite', 'a fully known background makes the blended ratio exact');
    const measured = Number.parseFloat(findings[0].measured);
    assert.ok(measured > 2.6 && measured < 3.1, `expected the blended ratio (~2.85:1), got ${findings[0].measured}`);
  });

  it('renders light and dark differently and defaults to no-preference', async (t) => {
    const capability = await resolveBrowser({ cwd: SCRIPTS });
    if (!capability.driven) return t.skip(`no driven browser: ${capability.reason}`);
    const { root, url } = await pageFixture();

    const shots = {};
    for (const scheme of ['light', 'dark']) {
      const result = await run(script('capture.mjs'),
        ['--url', url, '--viewport', '390x844', '--color-scheme', scheme, '--label', scheme, '--out', root],
        { cwd: root });
      assert.equal(result.code, 0, result.stderr);
      shots[scheme] = JSON.parse(result.stdout.trim().split('\n')[0]).sha256;
    }
    assert.notEqual(shots.light, shots.dark);

    const defaultRun = await run(script('capture.mjs'),
      ['--url', url, '--viewport', '390x844', '--label', 'default', '--out', root], { cwd: root });
    assert.equal(defaultRun.code, 0, defaultRun.stderr);
    assert.equal(JSON.parse(defaultRun.stdout.trim().split('\n')[0]).colorScheme, 'no-preference');
  });

  it('returns exactly the inspect-styles schema', async (t) => {
    const capability = await resolveBrowser({ cwd: SCRIPTS });
    if (!capability.driven) return t.skip(`no driven browser: ${capability.reason}`);
    const { root, url } = await pageFixture();

    const result = await run(script('inspect-styles.mjs'), ['--url', url], { cwd: root });
    assert.equal(result.code, 0, result.stderr);
    assert.deepEqual(Object.keys(JSON.parse(result.stdout)).sort(), [
      'backdrop_filter_count', 'backgrounds', 'border_radius_histogram', 'bordered_element_count',
      'box_shadow_patterns', 'button_variants', 'focusable_elements', 'font_render_check', 'fonts',
      'gradient_count', 'image_area_ratio', 'input_variants', 'loaded_fonts', 'media_participation',
      'scroll_regions', 'status'
    ]);
  });

  it('grades an undeliverable family without ever calling it definite', async (t) => {
    const capability = await resolveBrowser({ cwd: SCRIPTS });
    if (!capability.driven) return t.skip(`no driven browser: ${capability.reason}`);
    const root = await fixture();
    const file = path.join(root, 'missing-face.html');
    await fs.writeFile(file, MISSING_FACE_PAGE);

    const result = await run(script('inspect-styles.mjs'), ['--url', `file://${file}`], { cwd: root });
    assert.equal(result.code, 0, result.stderr);
    const record = JSON.parse(result.stdout).font_render_check.find((entry) => entry.family === 'NoSuchFace-ZZZ');
    assert.ok(record, 'the declared family should be sampled');
    assert.deepEqual(Object.keys(record).sort(), [
      'confidence', 'declared', 'family', 'fontsCheck', 'loadedFace', 'metricDistinct', 'platformFonts', 'sampleSelector'
    ]);
    assert.equal(record.declared, true);
    assert.notEqual(record.confidence, 'definite', 'a family with no @font-face was never proven to paint');
    assert.ok(['potential', 'unknown'].includes(record.confidence), `unexpected confidence ${record.confidence}`);
  });

  it('does not carry focus from one viewport into the next when the page rewrites its URL', async (t) => {
    const capability = await resolveBrowser({ cwd: SCRIPTS });
    // obscura (the rung 3 fallback) never moves focus on Tab, so it cannot exercise this bug either
    // way; only a real Chrome/Chromium driven through Playwright (CHROME_PATH or a
    // resolvable Playwright browser) can.
    if (capability.engine !== 'playwright') {
      return t.skip(`needs real Chrome/Chromium via Playwright, not obscura: ${capability.reason}`);
    }
    const root = await fixture();
    const file = path.join(root, 'rewrite.html');
    await fs.writeFile(file, URL_REWRITE_PAGE);

    const result = await run(script('check-ui.mjs'),
      ['--json', '--url', `file://${file}#token=secret`, '--viewport', '390x844', '--viewport', '1440x900'],
      { cwd: root });
    assert.equal(result.code, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.rendered.status, 'ok', JSON.stringify(report.rendered));
    const findings = Object.values(report.rendered.viewports).flatMap((entry) => entry.findings);
    assert.deepEqual(
      findings.filter((entry) => entry.type === 'focus-indicator-missing'),
      [],
      JSON.stringify(findings)
    );
  });

  it('reports a sidebar or background that stops before the page bottom, and nothing else', async (t) => {
    const capability = await resolveBrowser({ cwd: SCRIPTS });
    if (!capability.driven) return t.skip(`no driven browser: ${capability.reason}`);
    const root = await fixture();
    const results = {};
    for (const [name, { body, css = '' }] of Object.entries(REGION_PAGES)) {
      const file = path.join(root, `${name}.html`);
      await fs.writeFile(file, `<!doctype html><html lang="en"><head><style>
        body, h1 { margin: 0; } body { font: 16px/1.5 system-ui; } ${css}</style></head><body>${body}</body></html>`);
      const result = await run(script('check-ui.mjs'), ['--json', '--url', `file://${file}`, '--viewport', '1440x900']);
      assert.equal(result.code, 0, result.stderr);
      results[name] = JSON.parse(result.stdout).rendered.viewports['1440x900'].findings
        .filter((entry) => entry.type === 'region-stops-short')
        .map(({ selector, measured, confidence }) => ({ selector, measured, confidence }));
    }
    assert.deepEqual(results, {
      'in-flow-sidebar': [{ selector: 'aside.nav', measured: 'ends at 900px of a 2400px page', confidence: 'definite' }],
      'short-wrapper': [{ selector: 'div.shell', measured: 'ends at 900px of a 2400px page', confidence: 'definite' }],
      'fixed-sidebar': [],
      'sticky-sidebar': [],
      'footer-below-sidebar': [],
      'canvas-background': [],
      'no-scroll': []
    });
  });
});

const TALL = '<main style="height: 2400px"><h1>Orders</h1><p>Real copy.</p></main>';

const REGION_PAGES = {
  'in-flow-sidebar': {
    css: '.row { display: flex; align-items: flex-start; } .nav { width: 240px; height: 100vh; background: #1d2433; }',
    body: `<div class="row"><aside class="nav"><a href="#">Orders</a></aside>${TALL}</div>`
  },
  'short-wrapper': {
    css: 'html { background: #fff; } .shell { height: 100vh; background: #e8eef7; }',
    body: `<div class="shell">${TALL}</div>`
  },
  'fixed-sidebar': {
    css: '.nav { position: fixed; inset: 0 auto 0 0; width: 240px; height: 100vh; background: #1d2433; }'
      + ' main { margin-left: 240px; }',
    body: `<aside class="nav"><a href="#">Orders</a></aside>${TALL}`
  },
  'sticky-sidebar': {
    css: '.row { display: grid; grid-template-columns: 240px 1fr; }'
      + ' .nav { position: sticky; top: 0; height: 60vh; background: #1d2433; }',
    body: `<div class="row"><div class="column"><aside class="nav"><a href="#">Orders</a></aside></div>${TALL}</div>`
  },
  'footer-below-sidebar': {
    css: '.row { display: flex; } .nav { width: 240px; background: #1d2433; }'
      + ' footer { height: 200px; background: #333; color: #fff; }',
    body: `<div class="row"><aside class="nav"><a href="#">Orders</a></aside>${TALL}</div><footer>Footer</footer>`
  },
  'canvas-background': {
    css: 'body { height: 100vh; background: #e8eef7; }',
    body: TALL
  },
  'no-scroll': {
    css: '.row { display: flex; } .nav { width: 240px; height: 50vh; background: #1d2433; }',
    body: '<div class="row"><aside class="nav"><a href="#">Orders</a></aside><main><h1>Orders</h1></main></div>'
  }
};

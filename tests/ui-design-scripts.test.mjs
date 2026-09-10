// Behavioral tests for the ui-design skill scripts. No dependency beyond node:*.
// Every fixture lives under the OS temp directory and is removed afterwards;
// nothing is written inside the repository.

import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import {
  BROWSER_CAPABILITIES,
  obscuraServerArguments,
  resolveBrowser
} from '../skills/designing/scripts/capture.mjs';
import { fontConfidence } from '../skills/designing/scripts/inspect-styles.mjs';
import { fixture, run, script, SCRIPTS } from './harness.mjs';

function git(root, args) {
  return new Promise((resolve, reject) => {
    execFile(
      'git',
      ['-C', root, '-c', 'user.email=test@example.com', '-c', 'user.name=Test', '-c', 'commit.gpgsign=false', ...args],
      (error, stdout) => (error ? reject(error) : resolve(String(stdout).trim()))
    );
  });
}

const DESIGN_SECTIONS = [
  'Product and audience', 'Principles and visual direction', 'Anti-references', 'Typography',
  'Palette', 'Spacing and density', 'Geometry and controls', 'Surface, depth, material and lighting',
  'Icons, imagery and illustration', 'Motion', 'Responsive behavior', 'Canonical implementation',
  'Surface exceptions'
];

function designDocument({ commit = '0'.repeat(40), anchors = ['src/tokens.css'] } = {}) {
  const frontmatter = [
    '---',
    'schema: ui-design/v1',
    'status: approved',
    `last_reviewed_commit: ${commit}`,
    'source_anchors:',
    ...anchors.map((anchor) => `  - ${anchor}`),
    '---',
    '',
    '# Design',
    ''
  ].join('\n');
  const body = DESIGN_SECTIONS.map((heading) => `## ${heading}\n\nBody of ${heading}.\n`).join('\n');
  return `${frontmatter}${body}`;
}

async function writeDesign(root, options) {
  await fs.mkdir(path.join(root, 'docs', 'design'), { recursive: true });
  await fs.writeFile(path.join(root, 'docs', 'design', 'DESIGN.md'), designDocument(options));
}

async function designRepository({ anchors = ['src/tokens.css'] } = {}) {
  const root = await fixture();
  await git(root, ['init', '-b', 'main']);
  await fs.mkdir(path.join(root, 'src'), { recursive: true });
  for (const anchor of anchors) {
    await fs.mkdir(path.dirname(path.join(root, anchor)), { recursive: true });
    await fs.writeFile(path.join(root, anchor), ':root { --accent: oklch(63% 0.19 40); }\n');
  }
  await writeDesign(root, { anchors });
  await git(root, ['add', '-A']);
  await git(root, ['commit', '-m', 'initial']);
  const commit = await git(root, ['rev-parse', 'HEAD']);
  await writeDesign(root, { commit, anchors });
  return { root, commit };
}

async function readStatus(root) {
  const result = await run(script('context.mjs'), ['--status', '--root', root]);
  assert.equal(result.code, 0, result.stderr);
  return JSON.parse(result.stdout);
}

describe('entry guard', () => {
  it('runs main when the script is invoked through a symlinked path', async () => {
    const root = await fixture();
    const linked = path.join(root, 'linked-scripts');
    await fs.symlink(SCRIPTS, linked, 'dir');
    const result = await run(path.join(linked, 'capture.mjs'), []);
    assert.equal(result.code, 2, result.stderr);
    assert.match(result.stderr, /--url is required/);
  });
});

describe('context.mjs', () => {
  it('returns only the sections the surface needs', async () => {
    const { root } = await designRepository();
    await fs.mkdir(path.join(root, 'docs', 'design', 'surfaces'), { recursive: true });
    await fs.writeFile(path.join(root, 'docs', 'design', 'surfaces', 'dashboard.md'), '# Dashboard\n\nDelta only.\n');

    const result = await run(script('context.mjs'), [
      '--surface', 'dashboard', '--needs', 'color,motion', '--root', root
    ]);
    assert.equal(result.code, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.deepEqual(report.sections.map((section) => section.need), ['color', 'motion']);
    assert.deepEqual(report.sections.map((section) => section.heading), ['Palette', 'Motion']);
    assert.deepEqual(report.missing_needs, []);
    assert.match(report.surface.body, /Delta only/);
    assert.ok(!JSON.stringify(report.sections).includes('Typography'));
  });

  it('reports current when no anchor moved since the reviewed commit', async () => {
    const { root } = await designRepository();
    const report = await readStatus(root);
    assert.equal(report.design_context_status, 'current');
    assert.deepEqual(report.changed, []);
  });

  it('reports potentially-stale for committed, staged and unstaged anchor drift', async () => {
    const committed = await designRepository();
    await fs.appendFile(path.join(committed.root, 'src', 'tokens.css'), '\n/* moved on */\n');
    await git(committed.root, ['add', '-A']);
    await git(committed.root, ['commit', '-m', 'drift']);
    const committedReport = await readStatus(committed.root);
    assert.equal(committedReport.design_context_status, 'potentially-stale');
    assert.equal(committedReport.changed[0].committed, true);

    const unstaged = await designRepository();
    await fs.appendFile(path.join(unstaged.root, 'src', 'tokens.css'), '\n/* local edit */\n');
    const unstagedReport = await readStatus(unstaged.root);
    assert.equal(unstagedReport.design_context_status, 'potentially-stale');
    assert.equal(unstagedReport.changed[0].unstaged, true);
    assert.equal(unstagedReport.changed[0].committed, false);

    const staged = await designRepository();
    await fs.appendFile(path.join(staged.root, 'src', 'tokens.css'), '\n/* staged edit */\n');
    await git(staged.root, ['add', 'src/tokens.css']);
    const stagedReport = await readStatus(staged.root);
    assert.equal(stagedReport.design_context_status, 'potentially-stale');
    assert.equal(stagedReport.changed[0].staged, true);
  });

  it('reports absent without a DESIGN.md', async () => {
    const root = await fixture();
    const report = await readStatus(root);
    assert.equal(report.design_context_status, 'absent');
  });

  it('reports unknown with distinct reasons and never guesses', async () => {
    const unresolvable = await designRepository();
    await writeDesign(unresolvable.root, { commit: 'a'.repeat(40) });
    const unresolvableReport = await readStatus(unresolvable.root);

    const unmerged = await designRepository();
    await git(unmerged.root, ['checkout', '-b', 'side']);
    await fs.appendFile(path.join(unmerged.root, 'src', 'tokens.css'), '\n/* side */\n');
    await git(unmerged.root, ['add', '-A']);
    await git(unmerged.root, ['commit', '-m', 'side']);
    const sideCommit = await git(unmerged.root, ['rev-parse', 'HEAD']);
    await git(unmerged.root, ['checkout', 'main']);
    await writeDesign(unmerged.root, { commit: sideCommit });
    const unmergedReport = await readStatus(unmerged.root);

    const withoutGit = await fixture();
    await writeDesign(withoutGit, { commit: 'b'.repeat(40) });
    const withoutGitReport = await readStatus(withoutGit);

    for (const report of [unresolvableReport, unmergedReport, withoutGitReport]) {
      assert.equal(report.design_context_status, 'unknown');
      assert.ok(report.reason.length > 0);
    }
    const reasons = new Set([unresolvableReport.reason, unmergedReport.reason, withoutGitReport.reason]);
    assert.equal(reasons.size, 3);
    assert.match(unmergedReport.reason, /not an ancestor/);
  });

  it('reports unknown rather than reading an anchor outside the project root', async () => {
    const { root } = await designRepository();
    await writeDesign(root, { commit: await git(root, ['rev-parse', 'HEAD']), anchors: ['../escape.css'] });
    const report = await readStatus(root);
    assert.equal(report.design_context_status, 'unknown');
    assert.match(report.reason, /escapes the project root/);
  });

  it('rejects a surface name that is not a plain file-name token', async () => {
    const { root } = await designRepository();
    const result = await run(script('context.mjs'), ['--surface', '../../etc/passwd', '--root', root]);
    assert.equal(result.code, 2);
    assert.equal(result.stdout, '');
  });

  it('writes no file under --init', async () => {
    const root = await fixture();
    const result = await run(script('context.mjs'), ['--init'], { cwd: root });
    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, /schema: ui-design\/v1/);
    assert.deepEqual(await fs.readdir(root), []);
  });
});

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

    const result = await run(script('check-ui.mjs'), ['--source', root]);
    assert.equal(result.code, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    const types = report.static.findings.map((entry) => entry.type);
    for (const expected of ['transition-all', 'important-override', 'inline-event-handler', 'placeholder-copy']) {
      assert.equal(types.filter((type) => type === expected).length, 1, `${expected} in ${types.join(', ')}`);
    }
    assert.equal(report.rendered.status, 'unavailable');
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

    const result = await run(script('check-ui.mjs'), ['--source', root]);
    assert.equal(result.code, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout).static.findings, []);
  });

  const TELLS = [
    'overused-font', 'uniform-card-shadow', 'radial-halo', 'thin-border-wide-shadow', 'left-accent-card',
    'gradient-text', 'transition-all', 'emoji-in-markup', 'aggressive-gradient-ground', 'kicker-above-heading'
  ];

  async function tellsFor(stylesheet) {
    const root = await fixture();
    await fs.writeFile(path.join(root, 'styles.css'), stylesheet);
    const result = await run(script('check-ui.mjs'), ['--source', root]);
    assert.equal(result.code, 0, result.stderr);
    return JSON.parse(result.stdout).static.findings.filter((entry) => TELLS.includes(entry.type));
  }

  it('reports a font-family naming an overused family or its superfamily once', async () => {
    const tells = await tellsFor('.card {\n  font-family: "Inter Tight", system-ui, sans-serif;\n}\n');
    assert.deepEqual(tells.map((entry) => entry.type), ['overused-font']);
    assert.equal(tells[0].confidence, 'definite');
    assert.equal(tells[0].measured, 'Inter Tight');
  });

  it('reports transition-property: all as transition-all', async () => {
    const tells = await tellsFor('.nav a {\n  transition-property: all;\n  transition-duration: 200ms;\n}\n');
    assert.deepEqual(tells.map((entry) => entry.type), ['transition-all']);
  });

  it('reports a rounded card with a left accent bar', async () => {
    const tells = await tellsFor('.note {\n  border-left: 4px solid var(--accent);\n  border-radius: 12px;\n}\n');
    assert.deepEqual(tells.map((entry) => entry.type), ['left-accent-card']);
    assert.equal(tells[0].confidence, 'potential');
    assert.match(tells[0].selector, /^\.note \(styles\.css:1\)$/);
  });

  async function tellsForMarkup(markup) {
    const root = await fixture();
    await fs.writeFile(path.join(root, 'page.html'), markup);
    const result = await run(script('check-ui.mjs'), ['--source', root]);
    assert.equal(result.code, 0, result.stderr);
    return JSON.parse(result.stdout).static.findings.filter((entry) => TELLS.includes(entry.type));
  }

  it('reports the default drop shadow repeated across cards once, with the count', async () => {
    const tells = await tellsFor([
      '.card-a { box-shadow: 0 1px 3px rgba(0,0,0,.1); }',
      '.card-b { box-shadow: 0 1px 3px rgba(0,0,0,.1); }',
      '.card-c { box-shadow: 0 1px 3px rgba(0,0,0,.1); }'
    ].join('\n'));
    assert.deepEqual(tells.map((entry) => entry.type), ['uniform-card-shadow']);
    assert.equal(tells[0].measured, '0 1px 3px rgba(0,0,0,.1) on 3 selectors');
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
    const tells = await tellsFor('body {\n  background: linear-gradient(135deg, #667eea, #764ba2);\n}\n');
    assert.deepEqual(tells.map((entry) => entry.type), ['aggressive-gradient-ground']);
    assert.equal(tells[0].measured, '41 degrees between the first two stops');
  });

  it('reports a two-hue gradient ground written in oklch', async () => {
    const tells = await tellsFor('body {\n  background: linear-gradient(135deg, oklch(60% 0.2 280), oklch(55% 0.18 20));\n}\n');
    assert.deepEqual(tells.map((entry) => entry.type), ['aggressive-gradient-ground']);
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

  it('reports a centered translucent radial halo', async () => {
    const tells = await tellsFor('.halo {\n  background: radial-gradient(circle at center, rgba(120,80,255,0.35), transparent 70%);\n}\n');
    assert.deepEqual(tells.map((entry) => entry.type), ['radial-halo']);
    assert.equal(tells[0].confidence, 'potential');
  });

  it('reports a hairline border carrying a wide soft shadow', async () => {
    const tells = await tellsFor('.panel {\n  border: 1px solid #e5e5e5;\n  box-shadow: 0 4px 24px rgba(0,0,0,0.08);\n}\n');
    assert.deepEqual(tells.map((entry) => entry.type), ['thin-border-wide-shadow']);
    assert.equal(tells[0].measured, 'border 1px with 24px blur');
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
      '  background: linear-gradient(180deg, #f4f1ea, #ece6d8);',
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

describe('argument and JSON contracts', () => {
  const invalid = [
    ['context.mjs', ['--needs', 'color']],
    ['context.mjs', ['--status', '--nope']],
    ['capture.mjs', ['--url', 'file:///tmp/a.html', '--viewport', '390']],
    ['capture.mjs', ['--url', 'file:///tmp/a.html', '--color-scheme', 'sepia']],
    ['inspect-styles.mjs', ['--url', 'file:///tmp/a.html', '--viewport', 'wide']],
    ['check-ui.mjs', []],
    ['direction.mjs', ['--plan', '--seed', 'a', '--space', '/tmp/s.json', '--variants', '9']],
    ['font-candidates.mjs', ['--spec', '/tmp/spec.json', '--source', 'typekit']],
    ['inspect-render.mjs', ['--image', '/tmp/a.png', '--tile', '4']]
  ];

  for (const [name, args] of invalid) {
    it(`exits 2 without stdout for '${name} ${args.join(' ')}'`, async () => {
      const result = await run(script(name), args);
      assert.equal(result.code, 2, result.stderr);
      assert.equal(result.stdout, '');
      assert.ok(result.stderr.length > 0);
    });
  }
});

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
    const result = await run(script('check-ui.mjs'), ['--url', 'file:///tmp/none.html'],
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

async function withChromePath(value, body) {
  const previous = process.env.CHROME_PATH;
  process.env.CHROME_PATH = value;
  try {
    await body();
  } finally {
    if (previous === undefined) delete process.env.CHROME_PATH;
    else process.env.CHROME_PATH = previous;
  }
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

  it('drives obscura rather than a browser application when nothing rules it out', async (t) => {
    const capability = await resolveBrowser({ cwd: SCRIPTS });
    if (capability.engine !== 'obscura') return t.skip(`obscura is not the resolved rung: ${capability.reason}`);
    assert.equal(capability.driven, true);
    assert.equal(capability.executablePath, null, 'obscura is reached over CDP, not launched by path');
  });

  it('drops obscura for a capability it does not have, and says which', async (t) => {
    const available = await resolveBrowser({ cwd: SCRIPTS });
    if (available.engine !== 'obscura') return t.skip(`obscura is not the resolved rung: ${available.reason}`);

    for (const capability of Object.values(BROWSER_CAPABILITIES)) {
      const resolved = await resolveBrowser({ cwd: SCRIPTS, requires: [capability] });
      assert.notEqual(resolved.engine, 'obscura', `${capability} must not resolve to obscura`);
      assert.ok(resolved.attempts.some((attempt) => attempt.includes(capability)),
        `attempts should name ${capability}: ${resolved.attempts.join('; ')}`);
    }
  });

  it('keeps an explicit CHROME_PATH ahead of obscura and of a headless shell', async (t) => {
    const root = await fixture();
    const chosen = path.join(root, 'chosen-browser');
    await fs.writeFile(chosen, '');
    await withChromePath(chosen, async () => {
      const capability = await resolveBrowser({ cwd: SCRIPTS });
      if (capability.rung !== 3) return t.skip(`CHROME_PATH does not decide rung ${capability.rung}`);
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

  it('falls back down the ladder when the obscura server cannot start', async (t) => {
    if (process.platform === 'win32') return t.skip('the stand-in obscura is a POSIX shell script');
    const available = await resolveBrowser({ cwd: SCRIPTS });
    if (available.engine !== 'obscura') return t.skip(`obscura is not the resolved rung: ${available.reason}`);
    const fallback = await resolveBrowser({ cwd: SCRIPTS, excludeObscura: true });
    if (!fallback.driven) return t.skip(`no driven rung below obscura: ${fallback.reason}`);

    const root = await fixture();
    const page = path.join(root, 'page.html');
    await fs.writeFile(page, '<!doctype html><html lang="en"><title>t</title><p>fallback</p>');
    const binDirectory = path.join(root, 'bin');
    await fs.mkdir(binDirectory);
    await fs.writeFile(path.join(binDirectory, 'obscura'), '#!/bin/sh\nexit 1\n', { mode: 0o755 });

    const result = await run(script('capture.mjs'),
      ['--url', `file://${page}`, '--viewport', '320x240', '--label', 'fallback', '--out', root],
      { cwd: root, env: { PATH: `${binDirectory}${path.delimiter}${process.env.PATH}` } });
    assert.equal(result.code, 0, result.stderr);
    assert.doesNotMatch(result.stderr, /capture rung 1/, result.stderr);
    assert.equal(JSON.parse(result.stdout.trim().split('\n')[0]).engine, 'playwright');
  });
});

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
});

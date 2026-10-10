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
  engineWarning,
  obscuraServerArguments,
  resolveBrowser
} from '../skills/design-ui/scripts/capture.mjs';
import { parseFrontmatter } from '../skills/design-ui/scripts/context.mjs';
import { fontConfidence } from '../skills/design-ui/scripts/inspect-styles.mjs';
import { decodePng, rasterize } from '../skills/design-ui/scripts/inspect-render.mjs';
import {
  ALWAYS_BLOCKING, applyNotesTable, compareFindings, DECORATIVE_TELLS, notesTable, omitAdvisory, parseComputedColor,
  summaryLines
} from '../skills/design-ui/scripts/check-ui.mjs';
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

  it('parses a flow-style source_anchors list into its entries', () => {
    const { values } = parseFrontmatter('---\nsource_anchors: [src/a.css, "src/b.css"]\n---\n');
    assert.deepEqual(values.source_anchors, ['src/a.css', 'src/b.css']);
  });

  it('reports unknown when source_anchors names no file to compare', async () => {
    const { root } = await designRepository({ anchors: [] });
    const report = await readStatus(root);
    assert.equal(report.design_context_status, 'unknown');
    assert.match(report.reason, /source_anchors/);
  });

  it('carries the approval status from the front matter into the report', async () => {
    const { root } = await designRepository();
    assert.equal((await readStatus(root)).approval_status, 'approved');
    const text = await fs.readFile(path.join(root, 'docs', 'design', 'DESIGN.md'), 'utf8');
    await fs.writeFile(path.join(root, 'docs', 'design', 'DESIGN.md'), text.replace('status: approved', 'status: draft'));
    assert.equal((await readStatus(root)).approval_status, 'draft');
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

describe('check-ui.mjs named anti-patterns', () => {
  async function findingsFor(files) {
    const root = await fixture();
    for (const [name, content] of Object.entries(files)) {
      await fs.writeFile(path.join(root, name), content);
    }
    const result = await run(script('check-ui.mjs'), ['--json', '--source', root]);
    assert.equal(result.code, 0, result.stderr);
    return JSON.parse(result.stdout).static.findings;
  }

  function ofType(findings, type) {
    return findings.filter((entry) => entry.type === type);
  }

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

describe('check-ui.mjs notes table', () => {
  it('collapses two findings of one type into one notes entry with no threshold/note on the findings', async () => {
    const root = await fixture();
    await fs.writeFile(path.join(root, 'a.css'), '.a { transition: all 200ms ease; }\n');
    await fs.writeFile(path.join(root, 'b.css'), '.b { transition: all 100ms linear; }\n');

    const result = await run(script('check-ui.mjs'), ['--json', '--source', root]);
    assert.equal(result.code, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    const transitions = report.static.findings.filter((entry) => entry.type === 'transition-all');
    assert.equal(transitions.length, 2);
    assert.ok(transitions.every((entry) => !('threshold' in entry) && !('note' in entry)));
    assert.ok(report.notes['transition-all'].threshold);
    assert.ok(report.notes['transition-all'].note);
  });

  it('keeps a dynamic note on the finding it differs from in the table', () => {
    const definiteNote = 'text below the AA contrast minimum';
    const potentialNote = 'effective background is composited, so the ratio is indeterminate';
    const definite = {
      type: 'contrast-large-text', confidence: 'definite', selector: 'a', measured: '2:1',
      threshold: '3:1', note: definiteNote
    };
    const potential = {
      type: 'contrast-large-text', confidence: 'potential', selector: 'b', measured: '2:1',
      threshold: '3:1', note: potentialNote
    };
    const findings = [definite, potential];
    const table = applyNotesTable(findings);
    assert.deepEqual(table['contrast-large-text'], { threshold: '3:1', note: definiteNote });
    assert.equal(definite.threshold, undefined);
    assert.equal(definite.note, undefined);
    assert.equal(potential.threshold, undefined);
    assert.equal(potential.note, potentialNote);
  });

  it('reconstructs a finding from the table lossless', () => {
    const entries = [
      { type: 't', confidence: 'definite', selector: 'a', measured: '1', threshold: 'T', note: 'N' },
      { type: 't', confidence: 'definite', selector: 'b', measured: '2', threshold: 'T', note: 'other' }
    ];
    const table = notesTable(entries.map((entry) => ({ ...entry })));
    const stripped = entries.map((entry) => ({ ...entry }));
    applyNotesTable(stripped);
    const reconstructed = stripped.map((entry) => ({
      ...entry,
      threshold: entry.threshold ?? table[entry.type].threshold,
      note: entry.note ?? table[entry.type].note
    }));
    assert.deepEqual(reconstructed, entries);
  });

  it('prints one total line by default, and writes the full report and its per-type lines to --out', async () => {
    const root = await fixture();
    await fs.writeFile(path.join(root, 'a.css'), [
      '.a { transition: all 200ms ease; }',
      '.b { transition: all 100ms linear; }',
      '.c { color: #ff0055; }'
    ].join('\n'));
    const reportFile = path.join(root, 'report.json');

    const result = await run(script('check-ui.mjs'), ['--source', root, '--out', reportFile]);
    assert.equal(result.code, 0, result.stderr);
    const lines = result.stdout.trimEnd().split('\n');
    assert.equal(lines[0], `static=ok rendered=unavailable findings=3 shown=2 blocking=2 omitted=0 report=${reportFile}`);
    assert.equal(lines.length, 1);
    const report = JSON.parse(await fs.readFile(reportFile, 'utf8'));
    assert.deepEqual(report.typeSummary, ['transition-all 2 blocking=2']);
    assert.equal(report.static.findings.length, 3);
  });

  it('prints at most two stdout lines however many types it finds, and keeps the per-type lines in the report file', async () => {
    const root = await fixture();
    await fs.writeFile(path.join(root, 'a.css'), [
      '.a { transition: all 200ms ease; }',
      '.b { transition: all 100ms linear; }'
    ].join('\n'));
    await fs.writeFile(path.join(root, 'a.html'), '<html><body><img src="x.png"><svg></svg></body></html>\n');
    const reportFile = path.join(root, 'report.json');

    const result = await run(script('check-ui.mjs'), ['--source', root, '--out', reportFile]);
    assert.equal(result.code, 0, result.stderr);
    const lines = result.stdout.trimEnd().split('\n');
    assert.ok(lines.length <= 2, `stdout held ${lines.length} lines:\n${result.stdout}`);
    const report = JSON.parse(await fs.readFile(reportFile, 'utf8'));
    assert.ok(report.typeSummary.length >= 2, `typeSummary: ${JSON.stringify(report.typeSummary)}`);
    assert.ok(report.typeSummary.includes('transition-all 2 blocking=2'));
  });

  it('names a temp report file when --out is not given', async () => {
    const root = await fixture();
    await fs.writeFile(path.join(root, 'a.css'), '.a { transition: all 200ms ease; }\n');

    const result = await run(script('check-ui.mjs'), ['--source', root]);
    assert.equal(result.code, 0, result.stderr);
    const reportFile = /report=(\S+)$/.exec(result.stdout.split('\n')[0])[1];
    const report = JSON.parse(await fs.readFile(reportFile, 'utf8'));
    assert.equal(report.static.findings[0].type, 'transition-all');
    await fs.rm(path.dirname(reportFile), { recursive: true, force: true });
  });

  it('leaves media-query px out unless --all, and keeps a rule px in the same line', async () => {
    const root = await fixture();
    await fs.writeFile(path.join(root, 'a.css'), [
      '@media (min-width: 768px) {',
      '  .a { display: grid; }',
      '}',
      '@container (max-width: 40px) { .b { padding: 32px; } }'
    ].join('\n'));

    const types = (report) => report.static.findings.map((entry) => `${entry.type} ${entry.measured}`);
    const plain = await run(script('check-ui.mjs'), ['--json', '--source', root]);
    assert.equal(plain.code, 0, plain.stderr);
    assert.deepEqual(types(JSON.parse(plain.stdout)), ['raw-value-in-component-rule 32px']);
    const all = await run(script('check-ui.mjs'), ['--json', '--all', '--source', root]);
    assert.deepEqual(types(JSON.parse(all.stdout)), [
      'raw-value-in-media-query 768px', 'raw-value-in-media-query 40px', 'raw-value-in-component-rule 32px'
    ]);
  });

  it('writes every finding to the report file without --all, while the summary omits the advisory ones', async () => {
    const root = await fixture();
    await fs.writeFile(path.join(root, 'a.css'), [
      '@media (min-width: 768px) {',
      '  .a { display: grid; }',
      '}',
      '@container (max-width: 40px) { .b { padding: 32px; } }'
    ].join('\n'));
    const reportFile = path.join(root, 'report.json');

    const result = await run(script('check-ui.mjs'), ['--source', root, '--out', reportFile]);
    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout.split('\n')[0], / findings=1 .* omitted=2 /);
    const report = JSON.parse(await fs.readFile(reportFile, 'utf8'));
    assert.deepEqual(report.static.findings.map((entry) => `${entry.type} ${entry.measured}`), [
      'raw-value-in-media-query 768px', 'raw-value-in-media-query 40px', 'raw-value-in-component-rule 32px'
    ]);
  });

  it('omitAdvisory drops target-size-enhanced from every list and counts it', () => {
    const enhanced = { type: 'target-size-enhanced', confidence: 'potential', selector: 'a', measured: '30×30 CSS px' };
    const minimum = { type: 'target-size-minimum', confidence: 'definite', selector: 'b', measured: '20×20 CSS px' };
    const report = {
      static: { status: 'ok', findings: [] },
      rendered: {
        status: 'ok',
        fixed: { findings: [enhanced] },
        viewports: { '390x844': { status: 'ok', findings: [enhanced, minimum] } }
      }
    };
    assert.equal(omitAdvisory(report), 2);
    assert.deepEqual(report.rendered.fixed.findings, []);
    assert.deepEqual(report.rendered.viewports['390x844'].findings, [minimum]);
  });

  it('summaryLines puts the most blocking type first and hides ignored definite findings', () => {
    const contrast = { type: 'contrast-normal-text', confidence: 'definite', selector: 'p' };
    const ignoredCopy = { type: 'placeholder-copy', confidence: 'definite', selector: 'src/a.html:3' };
    const transition = { type: 'transition-all', confidence: 'definite', selector: 'src/a.css:1' };
    const findings = [transition, ignoredCopy, contrast];
    const report = {
      static: { status: 'ok' }, rendered: { status: 'ok' },
      comparison: { counts: { new: 1, predating: 1, ignored: 1 } }
    };
    const lines = summaryLines({
      report, findings, comparison: { blocking: [contrast] },
      ignoreEntries: [{ type: 'placeholder-copy', file: 'src/a.html', reason: 'fixture' }],
      omitted: 4, reportFile: null
    });
    assert.deepEqual(lines, {
      total: 'static=ok rendered=ok findings=3 shown=2 blocking=1 omitted=4 new=1 predating=1 ignored=1',
      types: ['contrast-normal-text 1 blocking=1', 'transition-all 1 blocking=0']
    });
  });
});

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

describe('argument and JSON contracts', () => {
  const invalid = [
    ['context.mjs', ['--needs', 'color']],
    ['context.mjs', ['--status', '--nope']],
    ['capture.mjs', ['--url', 'file:///tmp/a.html', '--viewport', '390']],
    ['capture.mjs', ['--url', 'file:///tmp/a.html', '--color-scheme', 'sepia']],
    ['inspect-styles.mjs', ['--url', 'file:///tmp/a.html', '--viewport', 'wide']],
    ['check-ui.mjs', []],
    ['direction.mjs', ['--plan', '--seed', 'a', '--space', '/tmp/s.json', '--variants', '9']],
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

describe('reference.mjs', () => {
  it('creates a draft DESIGN.md holding only the reference, then prints it', async () => {
    const root = await fixture();
    assert.equal((await run(script('reference.mjs'), ['--root', root])).stdout.trim(), '');
    const saved = await run(script('reference.mjs'), ['--set', ' Stripe ', '--root', root]);
    assert.equal(saved.code, 0, saved.stderr);
    assert.equal((await run(script('reference.mjs'), ['--root', root])).stdout.trim(), 'Stripe');
    const { values } = parseFrontmatter(await fs.readFile(path.join(root, 'docs', 'design', 'DESIGN.md'), 'utf8'));
    assert.equal(values.status, 'draft');
  });

  it('replaces the reference in an existing DESIGN.md and keeps the rest', async () => {
    const root = await fixture();
    const file = path.join(root, 'docs', 'design', 'DESIGN.md');
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, '---\nstatus: approved\nreference: Notion\n---\n\n# Design\n\n## Palette\n');
    const saved = await run(script('reference.mjs'), ['--set', 'Linear', '--root', root]);
    assert.equal(saved.code, 0, saved.stderr);
    const text = await fs.readFile(file, 'utf8');
    assert.deepEqual(parseFrontmatter(text).values, { status: 'approved', reference: 'Linear' });
    assert.match(text, /## Palette/);
  });

  it('refuses an empty name', async () => {
    const result = await run(script('reference.mjs'), ['--set', '', '--root', await fixture()]);
    assert.equal(result.code, 2);
  });

  it('saves display font, body font and accent beside the reference and keeps the rest', async () => {
    const root = await fixture();
    const file = path.join(root, 'docs', 'design', 'DESIGN.md');
    const first = await run(script('reference.mjs'), ['--set', 'Stripe', '--display-font', 'Fraunces', '--body-font', 'Inter', '--accent', '#1a73e8', '--root', root]);
    assert.equal(first.code, 0, first.stderr);
    assert.deepEqual(parseFrontmatter(await fs.readFile(file, 'utf8')).values, {
      schema: 'ui-design/v1', status: 'draft', reference: 'Stripe',
      'display-font': 'Fraunces', 'body-font': 'Inter', accent: '#1a73e8'
    });
    await fs.appendFile(file, '\n## Palette\n');
    const second = await run(script('reference.mjs'), ['--accent', '#e11d48', '--root', root]);
    assert.equal(second.code, 0, second.stderr);
    const text = await fs.readFile(file, 'utf8');
    const { values } = parseFrontmatter(text);
    assert.equal(values.accent, '#e11d48');
    assert.equal(values['display-font'], 'Fraunces');
    assert.equal(values.reference, 'Stripe');
    assert.match(text, /## Palette/);
    assert.equal((await run(script('reference.mjs'), ['--root', root])).stdout.trim(), 'Stripe');
  });

  it('refuses an empty font or accent', async () => {
    const result = await run(script('reference.mjs'), ['--body-font', ' ', '--root', await fixture()]);
    assert.equal(result.code, 2);
  });
});

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
} from '../skills/design-ui/scripts/capture.mjs';
import { parseFrontmatter } from '../skills/design-ui/scripts/context.mjs';
import { fontConfidence } from '../skills/design-ui/scripts/inspect-styles.mjs';
import {
  ALWAYS_BLOCKING, applyNotesTable, compareFindings, DECORATIVE_TELLS, notesTable
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

    const result = await run(script('check-ui.mjs'), ['--source', root]);
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

    const result = await run(script('check-ui.mjs'), ['--source', root]);
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

    const result = await run(script('check-ui.mjs'), ['--source', root]);
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

    const result = await run(script('check-ui.mjs'), ['--source', root]);
    assert.equal(result.code, 0, result.stderr);
    const findings = JSON.parse(result.stdout).static.findings
      .filter((entry) => entry.type === 'raw-value-in-component-rule');
    assert.deepEqual(findings.map((entry) => entry.selector), ['styles.css:3']);
  });

  async function tellsFor(stylesheet) {
    const root = await fixture();
    await fs.writeFile(path.join(root, 'styles.css'), stylesheet);
    const result = await run(script('check-ui.mjs'), ['--source', root]);
    assert.equal(result.code, 0, result.stderr);
    return JSON.parse(result.stdout).static.findings.filter((entry) => DECORATIVE_TELLS.includes(entry.type));
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
    assert.deepEqual(tells.map((entry) => entry.type), ['edge-accent-card']);
    assert.equal(tells[0].confidence, 'potential');
    assert.match(tells[0].selector, /^\.note \(styles\.css:1\)$/);
  });

  async function tellsForMarkup(markup) {
    const root = await fixture();
    await fs.writeFile(path.join(root, 'page.html'), markup);
    const result = await run(script('check-ui.mjs'), ['--source', root]);
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
    const result = await run(script('check-ui.mjs'), ['--source', root]);
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
});

describe('check-ui.mjs notes table', () => {
  it('collapses two findings of one type into one notes entry with no threshold/note on the findings', async () => {
    const root = await fixture();
    await fs.writeFile(path.join(root, 'a.css'), '.a { transition: all 200ms ease; }\n');
    await fs.writeFile(path.join(root, 'b.css'), '.b { transition: all 100ms linear; }\n');

    const result = await run(script('check-ui.mjs'), ['--source', root]);
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

  it('--summary prints at most 10 lines starting with static= on a --source-only run', async () => {
    const root = await fixture();
    await fs.writeFile(path.join(root, 'a.css'), '.a { transition: all 200ms ease; }\n');

    const result = await run(script('check-ui.mjs'), ['--source', root, '--summary']);
    assert.equal(result.code, 0, result.stderr);
    const lines = result.stdout.trimEnd().split('\n');
    assert.ok(lines.length <= 10, lines.join('\n'));
    assert.match(lines[0], /^static=/);
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

    const result = await run(script('check-ui.mjs'), ['--source', root]);
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
    const before = await run(script('check-ui.mjs'), ['--source', root]);
    assert.equal(before.code, 0, before.stderr);
    assert.equal(JSON.parse(before.stdout).comparison, undefined);
    const baselineFile = path.join(root, 'baseline.json');
    await fs.writeFile(baselineFile, before.stdout);
    await fs.writeFile(stylesheet, '.intro {\n  margin: 0 !important;\n}\n.card {\n  transition: all 200ms ease;\n}\n');

    const after = await run(script('check-ui.mjs'), ['--source', root, '--baseline', baselineFile]);
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
    const result = await run(script('check-ui.mjs'), ['--source', root, '--baseline', baselineFile]);
    assert.equal(result.code, 2);
    assert.match(result.stderr, /--baseline/);
  });

  it('rejects a --baseline that is JSON but no check-ui report with exit 2', async () => {
    const root = await fixture();
    const baselineFile = path.join(root, 'package.json');
    await fs.writeFile(baselineFile, '{"name": "site", "version": "1.0.0"}');
    const result = await run(script('check-ui.mjs'), ['--source', root, '--baseline', baselineFile]);
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
    const result = await run(script('check-ui.mjs'), ['--source', root, '--baseline', 'baseline.json'], { cwd: root });
    assert.equal(result.code, 0, result.stderr);
    const { comparison } = JSON.parse(result.stdout);
    const ignored = comparison.ignored.map((item) => [item.type, item.reason]);
    assert.deepEqual(ignored, [['important-override', 'vendor override the user confirmed']]);
    assert.ok(!comparison.new.some((item) => item.type === 'important-override'));
    assert.ok(!comparison.blocking.some((item) => item.type === 'important-override'));
  });

  it('rejects an ignore entry without a reason, naming its index and field', async () => {
    const root = await ignoreFixture([{ type: 'important-override', file: 'styles.css' }]);
    const result = await run(script('check-ui.mjs'), ['--source', root, '--baseline', 'baseline.json'], { cwd: root });
    assert.equal(result.code, 2);
    assert.match(result.stderr, /entry 0: reason/);
  });

  it('warns about an ignore entry whose type no check reports, naming the type', async () => {
    const root = await ignoreFixture([
      { type: 'important-override', file: 'styles.css', reason: 'vendor override the user confirmed' },
      { type: 'left-accent-card', file: 'styles.css', reason: 'brand stripe' }
    ]);
    const result = await run(script('check-ui.mjs'), ['--source', root, '--baseline', 'baseline.json'], { cwd: root });
    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stderr, /entry 1: unknown type left-accent-card/);
    assert.doesNotMatch(result.stderr, /important-override/);
  });

  it('warns about an ignore entry whose file still carries a rule and its line', async () => {
    const root = await ignoreFixture([{ type: 'cream-ground', file: 'body (styles.css:4)', reason: 'brand ground' }]);
    const result = await run(script('check-ui.mjs'), ['--source', root, '--baseline', 'baseline.json'], { cwd: root });
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

  it('runs two --viewport values and reports both keys under rendered.viewports', async (t) => {
    const capability = await resolveBrowser({ cwd: SCRIPTS });
    if (!capability.engine || !capability.driven) return t.skip(`no driven browser capability: ${capability.reason}`);
    const { url } = await pageFixture();

    const result = await run(script('check-ui.mjs'),
      ['--url', url, '--viewport', '390x844', '--viewport', '1440x900']);
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

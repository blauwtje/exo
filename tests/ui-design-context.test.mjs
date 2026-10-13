// Behavioral tests for the ui-design skill scripts. No dependency beyond node:*.
// Every fixture lives under the OS temp directory and is removed afterwards;
// nothing is written inside the repository.

import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { parseFrontmatter } from '../skills/design-ui/scripts/context.mjs';
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

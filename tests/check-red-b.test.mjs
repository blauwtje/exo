import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { checkMarkdownReferences } from '../verify/checks/markdown-references.mjs';
import { checkNameClash } from '../verify/checks/name-clash.mjs';
import { checkPluginVersion } from '../verify/checks/plugin-version.mjs';
import { checkProcessLifetime } from '../verify/checks/process-lifetime.mjs';
import { failures, tree } from './check-outcome.mjs';

function git(root, ...args) {
  const run = spawnSync('git', ['-C', root, '-c', 'user.name=T', '-c', 'user.email=t@example.com', ...args], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
}

test('markdown references fails on a path that does not resolve', () => {
  const root = tree({ 'README.md': 'See [gone](docs/gone.md).\n', 'skills/.keep': '' });
  const [failure] = failures(checkMarkdownReferences, root);
  assert.match(failure.detail, /docs\/gone\.md' does not resolve/);
});

test('name clash fails on a skill named like a bundled skill', () => {
  const root = tree({ 'skills/commit/SKILL.md': '---\nname: commit\n---\nBody.\n' });
  const marketplaces = tree({});
  const [failure] = failures(checkNameClash, root, { strict: true, marketplaces });
  assert.match(failure.detail, /commit/);
});


test('plugin version fails on a manifest that is not valid JSON', () => {
  const root = tree({
    'package.json': '{}',
    '.claude-plugin/plugin.json': '{',
    '.claude-plugin/marketplace.json': '{}'
  });
  const [failure] = failures(checkPluginVersion, root);
  assert.match(failure.detail, /not valid JSON/);
});

test('process lifetime fails on a skill script that fetches without a lifetime guard', () => {
  const root = tree({
    'skills/x/scripts/poll.mjs': "const reply = await fetch('https://example.com');\nconsole.log(process.argv[1], reply.status);\n"
  });
  git(root, 'init', '-q');
  git(root, 'add', '.');
  const [failure] = failures(checkProcessLifetime, root);
  assert.match(failure.detail, /skills\/x\/scripts\/poll\.mjs/);
});

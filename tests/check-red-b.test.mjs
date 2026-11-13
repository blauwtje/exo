import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRepository } from '../verify/repository.mjs';
import { checkMarkdownReferences } from '../verify/checks/markdown-references.mjs';
import { checkNameClash } from '../verify/checks/name-clash.mjs';
import { checkPluginVersion } from '../verify/checks/plugin-version.mjs';
import { checkProcessLifetime } from '../verify/checks/process-lifetime.mjs';

function recorder() {
  const results = [];
  const result = (...entry) => results.push({ status: entry[0], name: entry[1], detail: entry[2] });
  return {
    results,
    result,
    note: () => {},
    assert: (...entry) => result(entry[0] ? 'PASS' : 'FAIL', entry[1], entry[0] ? entry[2] : entry[3])
  };
}

function tree(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-check-red-'));
  for (const [relativePath, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, relativePath)), { recursive: true });
    fs.writeFileSync(path.join(root, relativePath), text);
  }
  return root;
}

function failures(check, root, options) {
  const report = recorder();
  check(report, createRepository(root), options);
  return report.results.filter((entry) => entry.status === 'FAIL');
}

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

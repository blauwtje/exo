import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkMarkdownReferences } from '../scripts/checks/markdown-references.mjs';
import { checkPluginVersion } from '../scripts/checks/plugin-version.mjs';
import { failures, tree } from './check-outcome.mjs';

test('markdown references fails on a path that does not resolve', () => {
  const root = tree({ 'README.md': 'See [gone](docs/gone.md).\n', 'skills/.keep': '' });
  const [failure] = failures(checkMarkdownReferences, root);
  assert.match(failure.detail, /docs\/gone\.md' does not resolve/);
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

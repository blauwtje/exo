import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { tempDir } from './harness.mjs';

const script = path.resolve('skills/build/scripts/regions.mjs');

function fixtureTree() {
  const root = tempDir('regions-');
  const files = ['src/components/Header.tsx', 'src/components/pricing-table.vue', 'src/components/Hero.tsx', 'src/pages/Hero.tsx', 'node_modules/pkg/Footer.tsx'];
  for (const file of files) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), '');
  }
  return root;
}

function run(root, names) {
  const flags = names.flatMap((name) => ['--region', name]);
  return spawnSync('node', [script, '--root', root, ...flags], { encoding: 'utf8' });
}

test('each numbered region maps to one existing component file', () => {
  const root = fixtureTree();
  const result = run(root, ['Header', 'Pricing table']);
  assert.equal(result.status, 0);
  const lines = result.stdout.trim().split('\n');
  assert.equal(lines[0], 'REGION 1 Header src/components/Header.tsx');
  assert.equal(lines[1], 'REGION 2 Pricing table src/components/pricing-table.vue');
  assert.equal(lines.at(-1), 'REGIONS mapped=2 unmapped=0');
  for (const line of lines.slice(0, 2)) assert.ok(fs.existsSync(path.join(root, line.split(' ').at(-1))));
});

test('a region with no file or two files is reported and fails the run', () => {
  const root = fixtureTree();
  const result = run(root, ['Footer', 'Hero']);
  assert.equal(result.status, 1);
  const lines = result.stdout.trim().split('\n');
  assert.equal(lines[0], 'MISSING 1 Footer');
  assert.equal(lines[1], 'AMBIGUOUS 2 Hero src/components/Hero.tsx src/pages/Hero.tsx');
  assert.equal(lines.at(-1), 'REGIONS mapped=0 unmapped=2');
});

test('no regions is a usage error', () => {
  const result = spawnSync('node', [script, '--root', tempDir('regions-')], { encoding: 'utf8' });
  assert.equal(result.status, 2);
});

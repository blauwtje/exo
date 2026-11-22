import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const SCRIPT = fileURLToPath(new URL('../skills/spec/scripts/repo-map.mjs', import.meta.url));

function mapOf(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-map-'));
  const run = (cmd, args) => spawnSync(cmd, args, { cwd: dir, encoding: 'utf8' });
  run('git', ['init', '-q']);
  for (const [name, body] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), body);
  run('git', ['add', '.']);
  const out = run('node', [SCRIPT]).stdout.split('\n');
  const mapFile = out[0];
  return { out, lines: fs.readFileSync(mapFile, 'utf8').split('\n'), dir };
}

test('a name used by 3 other files is marked with its count, one used by 2 is bare', () => {
  const user = (name) => `import { ${name} } from './a.mjs';\n${name}();\n`;
  const { lines, dir } = mapOf({
    'a.mjs': 'export function hub() {}\nexport function small() {}\n',
    'b.mjs': `${user('hub')}${user('small')}`,
    'c.mjs': `${user('hub')}${user('small')}`,
    'd.mjs': user('hub'),
  });
  try {
    assert.ok(lines.includes('a.mjs: hub•3, small'), lines.join('\n'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('line 2 of the map file is the legend and stdout stays the path and grep line', () => {
  const { out, lines, dir } = mapOf({ 'a.mjs': 'export const x = 1;\n' });
  try {
    assert.equal(lines[0], '# Repository map');
    assert.equal(lines[1], 'name•N: N other files use this export');
    assert.equal(out.filter(Boolean).length, 2);
    assert.match(out[1], /^grep -n/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

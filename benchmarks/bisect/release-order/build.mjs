import { append, buildHistory, edit } from '../lib/history.mjs';

const dest = process.argv[2];
if (!dest) throw new Error('usage: node build.mjs <dest>');

const CORE = 'src/versions.mjs';

const versions = `function parts(version) {
  return version.split('.').map(Number)
}

export function compareVersions(a, b) {
  const left = parts(a)
  const right = parts(b)
  const length = Math.max(left.length, right.length)
  for (let i = 0; i < length; i++) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

export function sortVersions(versions) {
  return [...versions].sort(compareVersions)
}

export function latest(versions) {
  return sortVersions(versions).at(-1)
}
`;

const repro = `import assert from 'node:assert/strict'
import { latest, sortVersions } from '../src/versions.mjs'

assert.deepEqual(sortVersions(['1.10.0', '1.2.0', '1.9.1']), ['1.2.0', '1.9.1', '1.10.0'])
assert.equal(latest(['2.0.0', '10.0.0', '9.9.9']), '10.0.0')
console.log('order ok')
`;

buildHistory(dest, {
  name: 'release-order',
  seed: 53,
  count: 120,
  base: {
    'README.md': '# release-order\n\nOrders release versions for the download picker.\n',
    [CORE]: versions,
    'test/order.mjs': repro,
  },
  core: {
    file: CORE,
    renames: [['isNewer', 'newerThan'], ['inRange', 'withinRange']],
    tweaks: [
      { subject: 'feat: export the initial version', append: "export const INITIAL_VERSION = '0.0.0'" },
      { subject: 'feat: export the prerelease separator', append: "export const PRERELEASE_SEPARATOR = '-'" },
    ],
  },
  steps: [
    {
      at: 0.08,
      subject: 'feat: add isNewer',
      apply: (files) => append(files, CORE, '\nexport function isNewer(a, b) {\n  return compareVersions(a, b) > 0\n}\n'),
    },
    {
      at: 0.2,
      subject: 'feat: accept a leading v',
      apply: (files) => edit(files, CORE, "return version.split('.').map(Number)", "return version.replace(/^v/, '').split('.').map(Number)"),
    },
    {
      at: 0.38,
      subject: 'feat: add nextPatch',
      apply: (files) => append(files, CORE, "\nexport function nextPatch(version) {\n  const [major, minor, patch] = version.replace(/^v/, '').split('.').map(Number)\n  return [major, minor, patch + 1].join('.')\n}\n"),
    },
    {
      at: 0.55,
      subject: 'refactor: drop hand-rolled version compare',
      body: 'localeCompare already orders strings, so the segment loop can go.',
      culprit: true,
      apply: (files) => {
        edit(files, CORE, /export function compareVersions[\s\S]*?\n}\n/, 'export function compareVersions(a, b) {\n  return a.localeCompare(b)\n}\n');
        edit(files, CORE, /function parts[\s\S]*?\n}\n\n/, '');
      },
    },
    {
      at: 0.62,
      subject: 'refactor: copy before sorting',
      apply: (files) => edit(files, CORE, 'return [...versions].sort(compareVersions)', 'return versions.slice().sort(compareVersions)'),
    },
    {
      at: 0.75,
      subject: 'feat: add range checks',
      apply: (files) => append(files, CORE, '\nexport function inRange(version, min, max) {\n  return compareVersions(version, min) >= 0 && compareVersions(version, max) < 0\n}\n'),
    },
    {
      at: 0.86,
      subject: 'feat: add oldest',
      apply: (files) => append(files, CORE, '\nexport function oldest(versions) {\n  return sortVersions(versions)[0]\n}\n'),
    },
  ],
});

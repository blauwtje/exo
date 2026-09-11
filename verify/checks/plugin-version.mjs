// One version lives in three manifests, and `claude plugin update` compares only
// the one in plugin.json: a change shipped without a raise installs as a no-op.
// The gate therefore demands a raise whenever the tree differs from the pushed
// base, and stays silent when it does not.

import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const PACKAGE_FILE = 'package.json';
const PLUGIN_FILE = '.claude-plugin/plugin.json';
const MARKETPLACE_FILE = '.claude-plugin/marketplace.json';
// The pushed state, never the local branch: `git diff main` on main compares HEAD
// to itself and would pass every unbumped commit.
const BASE_REF = 'origin/main';
const THREE_FIELDS = /^\d+\.\d+\.\d+$/;

function git(repository, args) {
  return spawnSync('git', ['-C', repository.root, ...args], { encoding: 'utf8' });
}

export function compareVersions(left, right) {
  const leftFields = left.split('.').map(Number);
  const rightFields = right.split('.').map(Number);
  for (let field = 0; field < Math.max(leftFields.length, rightFields.length); field += 1) {
    const difference = (leftFields[field] ?? 0) - (rightFields[field] ?? 0);
    if (difference !== 0) return Math.sign(difference);
  }
  return 0;
}

function marketplaceVersion(manifest, pluginName) {
  if (!Array.isArray(manifest.plugins)) return null;
  return manifest.plugins.find((plugin) => plugin.name === pluginName)?.version ?? null;
}

// Tracked differences and new files both ship, and `git diff` sees only the first.
function treeDiffers(repository) {
  if (git(repository, ['diff', '--quiet', BASE_REF]).status !== 0) return true;
  return (git(repository, ['ls-files', '--others', '--exclude-standard']).stdout ?? '').trim() !== '';
}

export function checkPluginVersion(report, repository) {
  const name = 'plugin version';
  const manifests = [PACKAGE_FILE, PLUGIN_FILE, MARKETPLACE_FILE];
  if (!manifests.every((manifest) => fs.existsSync(repository.join(manifest)))) {
    report.result('UNRUN', name, 'the repository root carries no plugin manifests');
    return;
  }

  let parsed;
  try {
    parsed = manifests.map((manifest) => JSON.parse(repository.text(repository.join(manifest))));
  } catch (error) {
    report.result('FAIL', name, `a plugin manifest is not valid JSON: ${error.message}`);
    return;
  }
  const [packageManifest, plugin, marketplace] = parsed;

  const declared = plugin.version;
  if (!THREE_FIELDS.test(declared ?? '')) {
    report.result('FAIL', name, `${PLUGIN_FILE} carries ${declared ?? 'no version'}, not a three-field version`);
    return;
  }

  const elsewhere = {
    [PACKAGE_FILE]: packageManifest.version,
    [MARKETPLACE_FILE]: marketplaceVersion(marketplace, plugin.name)
  };
  const disagreeing = Object.entries(elsewhere).filter(([, version]) => version !== declared);
  if (disagreeing.length > 0) {
    const lagging = disagreeing.map(([file, version]) => `${file} carries ${version ?? 'no version'}`);
    report.result('FAIL', name, `${PLUGIN_FILE} carries ${declared} but ${lagging.join(' and ')}`);
    return;
  }

  const shown = git(repository, ['show', `${BASE_REF}:${PLUGIN_FILE}`]);
  if (shown.status !== 0) {
    report.result('UNRUN', name, `every manifest carries ${declared}; ${BASE_REF} is not available to compare against`);
    return;
  }

  const baseVersion = JSON.parse(shown.stdout).version;
  const changed = treeDiffers(repository);
  report.assert(
    !changed || compareVersions(declared, baseVersion) > 0,
    name,
    changed
      ? `every manifest carries ${declared}, above ${BASE_REF} at ${baseVersion}`
      : `every manifest carries ${declared}, matching an unchanged ${BASE_REF}`,
    `the tree differs from ${BASE_REF} while the version stays ${declared}: run npm run bump`
  );
}

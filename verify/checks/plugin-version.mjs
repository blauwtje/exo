// One version lives in three manifests, and `claude plugin update` compares only
// the one in plugin.json, so users receive a change only when a release raises
// it. Between releases every change waits under `## Unreleased` in CHANGELOG.md:
// the gate demands that entry whenever the tree differs from the pushed base,
// and a raised version must carry the dated section `npm run bump` writes.

import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { sectionBody, UNRELEASED_HEADING } from '../changelog.mjs';

const PACKAGE_FILE = 'package.json';
const PLUGIN_FILE = '.claude-plugin/plugin.json';
const MARKETPLACE_FILE = '.claude-plugin/marketplace.json';
const CHANGELOG_FILE = 'CHANGELOG.md';
// The pushed state, never the local branch: `git diff main` on main compares HEAD
// to itself and would pass every unrecorded commit.
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

function changelogText(repository) {
  const file = repository.join(CHANGELOG_FILE);
  return fs.existsSync(file) ? repository.text(file) : '';
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
  const order = compareVersions(declared, baseVersion);
  if (order < 0) {
    report.result('FAIL', name, `every manifest carries ${declared}, below ${BASE_REF} at ${baseVersion}`);
    return;
  }

  const changelog = changelogText(repository);
  if (order > 0) {
    const dated = changelog.split(/\r?\n/).some((line) => line.startsWith(`## ${declared} - `));
    report.assert(
      dated,
      name,
      `every manifest carries ${declared}, above ${BASE_REF} at ${baseVersion}`,
      `the version rose to ${declared} but ${CHANGELOG_FILE} has no "## ${declared} - <date>" section: raise it with npm run bump`
    );
    return;
  }

  if (!treeDiffers(repository)) {
    report.result('PASS', name, `every manifest carries ${declared}, matching an unchanged ${BASE_REF}`);
    return;
  }

  const unreleased = sectionBody(changelog, UNRELEASED_HEADING);
  report.assert(
    unreleased !== null && unreleased !== '',
    name,
    `every manifest carries ${declared}; the changes since ${BASE_REF} wait under ${UNRELEASED_HEADING}`,
    `the tree differs from ${BASE_REF} while ${CHANGELOG_FILE} has nothing under ${UNRELEASED_HEADING}: record the change there`
  );
}

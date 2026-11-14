
import fs from 'node:fs';
import { releaseHeading, sectionBody, UNRELEASED_HEADING } from '../changelog.mjs';
import { git } from '#git';

const PACKAGE_FILE = 'package.json';
const PLUGIN_FILE = '.claude-plugin/plugin.json';
const MARKETPLACE_FILE = '.claude-plugin/marketplace.json';
const CHANGELOG_FILE = 'CHANGELOG.md';
const BASE_REF = 'origin/main';
const THREE_FIELDS = /^\d+\.\d+\.\d+$/;

function compareVersions(left, right) {
  const leftFields = left.split('.').map(Number);
  const rightFields = right.split('.').map(Number);
  for (let field = 0; field < Math.max(leftFields.length, rightFields.length); field += 1) {
    const difference = (leftFields[field] ?? 0) - (rightFields[field] ?? 0);
    if (difference !== 0) return Math.sign(difference);
  }
  return 0;
}

function marketplaceEntry(manifest, pluginName) {
  if (!Array.isArray(manifest.plugins)) return undefined;
  return manifest.plugins.find((plugin) => plugin.name === pluginName);
}

function treeDiffers(repository) {
  if (git(repository.root, ['diff', '--quiet', BASE_REF]).status !== 0) return true;
  return (git(repository.root, ['ls-files', '--others', '--exclude-standard']).stdout ?? '').trim() !== '';
}

function changelogText(repository) {
  const file = repository.join(CHANGELOG_FILE);
  return fs.existsSync(file) ? repository.text(file) : '';
}

function readManifests(repository) {
  const manifests = [PACKAGE_FILE, PLUGIN_FILE, MARKETPLACE_FILE];
  if (!manifests.every((manifest) => fs.existsSync(repository.join(manifest)))) {
    return { verdict: ['UNRUN', 'the repository root carries no plugin manifests'] };
  }
  try {
    const [packageManifest, plugin, marketplace] = manifests.map((manifest) => JSON.parse(repository.text(repository.join(manifest))));
    return { packageManifest, plugin, marketplace };
  } catch (error) {
    return { verdict: ['FAIL', `a plugin manifest is not valid JSON: ${error.message}`] };
  }
}

function disagreementVerdict({ packageManifest, plugin, marketplace }) {
  const declared = plugin.version;
  if (!THREE_FIELDS.test(declared ?? '')) {
    return ['FAIL', `${PLUGIN_FILE} carries ${declared ?? 'no version'}, not a three-field version`];
  }
  const entry = marketplaceEntry(marketplace, plugin.name);
  const elsewhere = { [PACKAGE_FILE]: packageManifest.version, [MARKETPLACE_FILE]: entry?.version ?? null };
  const disagreeing = Object.entries(elsewhere).filter(([, version]) => version !== declared);
  if (disagreeing.length > 0) {
    const lagging = disagreeing.map(([file, version]) => `${file} carries ${version ?? 'no version'}`);
    return ['FAIL', `${PLUGIN_FILE} carries ${declared} but ${lagging.join(' and ')}`];
  }
  const described = { [PACKAGE_FILE]: packageManifest.description, [MARKETPLACE_FILE]: entry?.description };
  const differing = Object.entries(described).filter(([, description]) => description !== plugin.description);
  if (differing.length > 0) {
    return ['FAIL', `${differing.map(([file]) => file).join(' and ')} describe the plugin differently from ${PLUGIN_FILE}`];
  }
  return null;
}

function belowBaseVerdict(repository, declared, baseVersion) {
  const mergeBase = git(repository.root, ['merge-base', 'HEAD', BASE_REF]).stdout.trim();
  const forked = mergeBase === '' ? { status: 1 } : git(repository.root, ['show', `${mergeBase}:${PLUGIN_FILE}`]);
  if (forked.status === 0 && JSON.parse(forked.stdout).version === declared) {
    return ['WARN', `every manifest carries ${declared}, as at the fork point; ${BASE_REF} moved ahead to ${baseVersion} with a release: rebase onto ${BASE_REF}`];
  }
  return ['FAIL', `every manifest carries ${declared}, below ${BASE_REF} at ${baseVersion}`];
}

function aboveBaseVerdict(changelog, declared, baseVersion) {
  if (releaseHeading(changelog, declared) !== undefined) {
    return ['PASS', `every manifest carries ${declared}, above ${BASE_REF} at ${baseVersion}`];
  }
  return ['FAIL', `the version rose to ${declared} but ${CHANGELOG_FILE} has no "## ${declared} - <date>" section: raise it with npm run bump`];
}

function unreleasedVerdict(repository, changelog, { declared, strict }) {
  if (!treeDiffers(repository)) return ['PASS', `every manifest carries ${declared}, matching an unchanged ${BASE_REF}`];
  const unreleased = sectionBody(changelog, UNRELEASED_HEADING);
  if (unreleased !== null && unreleased !== '') {
    return ['PASS', `every manifest carries ${declared}; the changes since ${BASE_REF} wait under ${UNRELEASED_HEADING}`];
  }
  const branch = git(repository.root, ['symbolic-ref', '--short', '-q', 'HEAD']).stdout.trim();
  if (!strict && branch !== '' && branch !== BASE_REF.replace(/^origin\//, '')) {
    return ['PASS', `every manifest carries ${declared}; the tree differs from ${BASE_REF} and the lead writes the ${UNRELEASED_HEADING} line at landing`];
  }
  return ['FAIL', `the tree differs from ${BASE_REF} while ${CHANGELOG_FILE} has nothing under ${UNRELEASED_HEADING}: record the change there`];
}

function baseVerdict(repository, declared, strict) {
  const shown = git(repository.root, ['show', `${BASE_REF}:${PLUGIN_FILE}`]);
  if (shown.status !== 0) {
    return ['UNRUN', `every manifest carries ${declared}; ${BASE_REF} is not available to compare against`];
  }
  const baseVersion = JSON.parse(shown.stdout).version;
  const order = compareVersions(declared, baseVersion);
  if (order < 0) return belowBaseVerdict(repository, declared, baseVersion);
  const changelog = changelogText(repository);
  if (order > 0) return aboveBaseVerdict(changelog, declared, baseVersion);
  return unreleasedVerdict(repository, changelog, { declared, strict });
}

export function checkPluginVersion(report, repository, { strict = false } = {}) {
  const name = 'plugin version';
  const manifests = readManifests(repository);
  const [status, detail] = manifests.verdict
    ?? disagreementVerdict(manifests)
    ?? baseVerdict(repository, manifests.plugin.version, strict);
  report.result(status, name, detail);
}

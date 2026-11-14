
export const UNRELEASED_HEADING = '## Unreleased';

export function sectionBody(changelog, heading) {
  const lines = changelog.split(/\r?\n/);
  const start = lines.indexOf(heading);
  if (start === -1) return null;
  const next = lines.findIndex((line, index) => index > start && line.startsWith('## '));
  const end = next === -1 ? lines.length : next;
  return lines.slice(start + 1, end).join('\n').trim();
}

export function releaseHeading(changelog, version) {
  const lines = changelog.split(/\r?\n/);
  return lines.find((line) => line.startsWith(`## ${version} - `));
}

export function releaseLevel(unreleased, version) {
  const major = Number(version.split('.')[0]);
  if (/^### Removed$/m.test(unreleased)) return major === 0 ? 'minor' : 'major';
  if (/^### Added$/m.test(unreleased)) return 'minor';
  return 'patch';
}

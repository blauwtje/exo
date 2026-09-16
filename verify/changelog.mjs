// CHANGELOG.md holds `## Unreleased` above one `## <version> - <date>` section
// per release, each split into `### Highlights`, `### Added`, `### Changed`,
// `### Fixed` and `### Removed`. Shared by bump.mjs, release-notes.mjs and the
// plugin version gate.

export const UNRELEASED_HEADING = '## Unreleased';

// The text between a heading line and the next `## ` heading, trimmed; null
// when the heading line is absent.
export function sectionBody(changelog, heading) {
  const lines = changelog.split(/\r?\n/);
  const start = lines.indexOf(heading);
  if (start === -1) return null;
  const next = lines.findIndex((line, index) => index > start && line.startsWith('## '));
  const end = next === -1 ? lines.length : next;
  return lines.slice(start + 1, end).join('\n').trim();
}

// The `## <version> - <date>` line `npm run bump` writes for a release;
// undefined when that version has no dated section.
export function releaseHeading(changelog, version) {
  const lines = changelog.split(/\r?\n/);
  return lines.find((line) => line.startsWith(`## ${version} - `));
}

// The changelog policy: removing public surface breaks callers, which is a
// minor release before 1.0 and a major one after; adding surface is a minor
// release; anything else is a patch.
export function releaseLevel(unreleased, version) {
  const major = Number(version.split('.')[0]);
  if (/^### Removed$/m.test(unreleased)) return major === 0 ? 'minor' : 'major';
  if (/^### Added$/m.test(unreleased)) return 'minor';
  return 'patch';
}

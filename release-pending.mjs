// Print `yes` when CHANGELOG.md records a change under `## Unreleased` and `no`
// when it does not, so the release workflow can tell a merge that records
// nothing from a bump.mjs run that failed: both would otherwise exit 1.
//
// It answers with bump.mjs's own emptiness test, so the two never disagree; a
// section holding bare `### Added` headings and no entry reads as a change to
// both, and bump.mjs is where that would be tightened.
//
//   node release-pending.mjs

import fs from 'node:fs';
import path from 'node:path';
import { sectionBody, UNRELEASED_HEADING } from './verify/changelog.mjs';

const changelog = fs.readFileSync(path.join(import.meta.dirname, 'CHANGELOG.md'), 'utf8');
const unreleased = sectionBody(changelog, UNRELEASED_HEADING);
console.log(unreleased ? 'yes' : 'no');

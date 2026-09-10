// Port of Test-InstallationLinks (verify.ps1:710-760) and Get-LinkTargetPath
// (verify.ps1:697-708): when ~/.claude/skills exists, each installed link points at
// this repository's skills/<name>, and no leftover link there points into this
// repository under another name. Skipped under --skip-link-check, which the
// self-test uses because its fixture copy is not the installed source.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EXPECTED_SKILLS } from '../budgets.mjs';

// A symbolic link may record a relative target, which resolves against the
// directory holding the link, not the working directory.
function linkTargetPath(linkPath) {
  const recorded = fs.readlinkSync(linkPath);
  if (recorded.trim() === '') return null;
  return path.resolve(path.dirname(linkPath), recorded);
}

function isDirectory(target) {
  return fs.existsSync(target) && fs.statSync(target).isDirectory();
}

export function checkInstallationLinks(report, repository, options) {
  if (options.skipLinkCheck) {
    report.result('UNRUN', 'installation links', 'skipped for an isolated verifier self-test');
    return;
  }

  const harnessRoot = path.join(os.homedir(), '.claude', 'skills');
  if (!isDirectory(harnessRoot)) {
    report.result('UNRUN', 'installation links', 'neither harness skill directory exists');
    return;
  }

  const sourcePrefix = repository.skillsRoot.replace(/[\\/]+$/, '') + path.sep;
  const errors = [];
  let checked = 0;

  for (const skill of EXPECTED_SKILLS) {
    const linkPath = path.join(harnessRoot, skill);
    let entry;
    try {
      entry = fs.lstatSync(linkPath);
    } catch {
      errors.push(`${linkPath} is missing`);
      continue;
    }
    checked += 1;
    if (!entry.isSymbolicLink()) {
      errors.push(`${linkPath} is not a symbolic link`);
      continue;
    }
    const actual = linkTargetPath(linkPath);
    const expected = path.resolve(repository.skillsRoot, skill);
    if (actual !== expected) {
      errors.push(`${linkPath} targets '${actual}', expected '${expected}'`);
    }
  }

  // A link under a name no longer in EXPECTED_SKILLS still resolves into this
  // repository, so the harness keeps loading a skill this corpus renamed away.
  for (const name of fs.readdirSync(harnessRoot)) {
    if (EXPECTED_SKILLS.includes(name)) continue;
    const linkPath = path.join(harnessRoot, name);
    if (!fs.lstatSync(linkPath).isSymbolicLink()) continue;
    const actual = linkTargetPath(linkPath);
    if (actual !== null && actual.toLowerCase().startsWith(sourcePrefix.toLowerCase())) {
      errors.push(`${linkPath} is a stale link into this repository`);
    }
  }

  if (checked === 0 && errors.length === 0) {
    report.result('UNRUN', 'installation links', 'neither harness skill directory exists');
    return;
  }
  report.assert(
    errors.length === 0,
    'installation links',
    `${checked} expected harness links resolve to repository copies`,
    errors.join('; ')
  );
}

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { coversCompanion, isCovered } from '#plan-landed';

export function repoPathOf(planPath, root) {
  const top = execFileSync('git', ['-C', root, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
  // why: git prints repository paths with / separators on every platform.
  return path.relative(top, fs.realpathSync(planPath)).split(path.sep).join('/');
}

export function findUnplannedPaths(tasks, paths) {
  const declared = tasks.flatMap((task) => task.files.map((file) => file.path));
  return paths.filter((path) => !isCovered(declared, path) && !coversCompanion(declared, path));
}

export function isTrailerlessFix({ subject, body }) {
  return /^fix(\([^)]*\))?!?:/.test(subject) && !/^Plan-task: /m.test(body);
}

function isLeadChangelog({ subject, body }) {
  return /^docs\(changelog\):/.test(subject) && !/^Plan-task: /m.test(body);
}

export function splitFixOnlyPaths(paths, commitsByPath) {
  const unplanned = [];
  const fixOnly = [];
  const lead = [];
  for (const path of paths) {
    const commits = commitsByPath.get(path) ?? [];
    const shas = commits.map((commit) => commit.sha.slice(0, 7));
    if (commits.length > 0 && commits.every(isTrailerlessFix)) fixOnly.push({ path, shas });
    else if (path === 'CHANGELOG.md' && commits.length > 0 && commits.every(isLeadChangelog)) lead.push({ path, shas });
    else unplanned.push(path);
  }
  return { unplanned, fixOnly, lead };
}

export function commitsTouching(paths, root, base) {
  const commitsByPath = new Map();
  if (base === undefined) return commitsByPath;
  for (const path of paths) {
    const log = execFileSync('git', ['-C', root, '-c', 'core.quotepath=off', 'log', '--no-renames', '--format=%x01%H%x00%B', `${base}..HEAD`, '--', path], { encoding: 'utf8', maxBuffer: Infinity });
    commitsByPath.set(path, log.split('\x01').filter((entry) => entry !== '').map((entry) => {
      const [sha, body] = entry.split('\0');
      return { sha, subject: body.split('\n')[0], body };
    }));
  }
  return commitsByPath;
}

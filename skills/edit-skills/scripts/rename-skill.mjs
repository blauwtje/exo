#!/usr/bin/env node
// Renames a skill everywhere it lives: moves `skills/<from>/`,
// `docs/skills/<from>.md` and, when it exists, `benchmarks/pressure/<from>/`
// to `<to>`, then rewrites every word-bounded mention of `<from>` to `<to>`
// across the repository. `CHANGELOG.md`, `benchmarks/results/`, `.git/` and
// `.worktrees/` are skipped, because the changelog's own history and a past
// run's saved output name the skill as it was, not as it is renamed to.
//
//   node rename-skill.mjs --from <old-name> --to <new-name> [--root <dir>]
//
// Prints one line per rewritten file as `<path> <count>`.

import fs from 'node:fs';
import { realpathSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseFlags, UsageError } from '#script-flags';

/** The skill folder, its docs page or its pressure folder is missing or already taken. */
export class RenameError extends Error {}

const NAME_PATTERN = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
const SKIPPED_DIR_NAMES = new Set(['.git', '.worktrees']);
const SKIPPED_RELATIVE_PATHS = new Set(['CHANGELOG.md']);
const SKIPPED_RELATIVE_PREFIXES = ['benchmarks/results/'];

function assertSkillName(name, flag) {
  if (!NAME_PATTERN.test(name)) throw new UsageError(`flag '${flag}' needs a kebab-case skill name`);
}

function isSkipped(relativePath) {
  if (SKIPPED_RELATIVE_PATHS.has(relativePath)) return true;
  return SKIPPED_RELATIVE_PREFIXES.some((prefix) => relativePath.startsWith(prefix));
}

/** Every file under `root`, relative-pathed with forward slashes, skipping the paths above. */
function listFiles(root) {
  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (SKIPPED_DIR_NAMES.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      const relative = path.relative(root, full).split(path.sep).join('/');
      if (isSkipped(relative)) continue;
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile()) {
        files.push(relative);
      }
    }
  };
  walk(root);
  return files.sort();
}

/** Moves `fromRelative` to `toRelative` under `root` when the source exists; reports whether it moved. */
function moveIfPresent(root, fromRelative, toRelative) {
  const from = path.join(root, fromRelative);
  if (!fs.existsSync(from)) return false;
  fs.mkdirSync(path.dirname(path.join(root, toRelative)), { recursive: true });
  fs.renameSync(from, path.join(root, toRelative));
  return true;
}

/** Moves the skill's folder, docs page and pressure folder, then rewrites every
 * word-bounded mention of `from` to `to` in what is left. Returns the
 * `{ path, count }` rows for every file it rewrote, sorted by path. */
export function renameSkill({ root, from, to }) {
  const skillFolder = path.join('skills', from);
  if (!fs.existsSync(path.join(root, skillFolder))) {
    throw new RenameError(`no skill folder at 'skills/${from}'`);
  }
  if (fs.existsSync(path.join(root, 'skills', to))) {
    throw new RenameError(`a skill folder already exists at 'skills/${to}'`);
  }
  moveIfPresent(root, skillFolder, path.join('skills', to));
  moveIfPresent(root, path.join('docs', 'skills', `${from}.md`), path.join('docs', 'skills', `${to}.md`));
  moveIfPresent(root, path.join('benchmarks', 'pressure', from), path.join('benchmarks', 'pressure', to));

  const escaped = from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const mention = new RegExp(`(?<![a-z0-9-])${escaped}(?![a-z0-9-])`, 'g');
  const rows = [];
  for (const relative of listFiles(root)) {
    const full = path.join(root, relative);
    const text = fs.readFileSync(full, 'utf8');
    const count = (text.match(mention) ?? []).length;
    if (count === 0) continue;
    fs.writeFileSync(full, text.replace(mention, to));
    rows.push({ path: relative, count });
  }
  return rows;
}

function main(argv) {
  const flags = parseFlags(argv, { from: 'value', to: 'value', root: 'value' });
  if (flags.from === undefined) throw new UsageError("flag '--from' names the skill to rename");
  if (flags.to === undefined) throw new UsageError("flag '--to' names the new skill name");
  assertSkillName(flags.from, '--from');
  assertSkillName(flags.to, '--to');
  const root = flags.root ?? process.cwd();
  const rows = renameSkill({ root, from: flags.from, to: flags.to });
  process.stdout.write(rows.map((row) => `${row.path} ${row.count}`).join('\n') + (rows.length > 0 ? '\n' : ''));
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    if (error instanceof UsageError) {
      process.stderr.write(`rename-skill: ${error.message}\n`);
      process.exitCode = 2;
    } else if (error instanceof RenameError) {
      process.stderr.write(`rename-skill: ${error.message}\n`);
      process.exitCode = 1;
    } else {
      throw error;
    }
  }
}

#!/usr/bin/env node
// The vocabulary `issuing` fills an issue or a pull request from, and the
// Size, Estimate and Priority a fixed ladder computes so two sessions land
// on the same numbers.
//
//   node repo-fields.mjs [--refresh]
//   node repo-fields.mjs --size --paths <n> --criteria <n> --shape spec|report
//     [--shipped] [--blocking] [--options "<highest>,...,<lowest>"]
//
// The default mode reads the repository's vocabulary through gh, caches it
// for a day at `<git-common-dir>/exo/fields.json`, and prints it as one
// compact JSON line; `--refresh` bypasses a fresh cache and rewrites it. A
// gh failure on the repo or label read prints `fields: error gh=<first
// stderr line>` and exits 3, writing no cache; every other read is optional
// and falls back to an empty list plus one line in the printed `unread`.
//
// --size takes no gh call and no cache: it sizes max(paths, criteria) against
// a fixed table, reads the matching estimate off it, and ranks the item's
// priority by its shape and, for a report, --shipped, or for a spec,
// --blocking, against the four-way rank the options list (or P0/P1/P2 with
// none given) carries. It prints one compact JSON line and exits 0.
// A usage error prints nothing to stdout and exits 2.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { realpathSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { memoryDirectory } from '#memory-store';
import { UsageError, parseFlags } from '#script-flags';

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

// GitHub's own defaults: a label or a project field outside these names, or
// any issue type at all, marks the repository as having its own vocabulary
// (fields.md's rule).
const DEFAULT_LABELS = new Set([
  'bug', 'documentation', 'duplicate', 'enhancement', 'good first issue',
  'help wanted', 'invalid', 'question', 'wontfix'
]);
const DEFAULT_PROJECT_FIELDS = new Set([
  'Title', 'Assignees', 'Status', 'Labels', 'Linked pull requests',
  'Milestone', 'Repository', 'Reviewers', 'Parent issue', 'Sub-issues progress'
]);

// Raised only for a gh failure, so it is told apart from a programming error
// that should still crash the script.
class GhError extends Error {}

function gh(args) {
  try {
    return execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (error) {
    const text = `${error.stderr ?? ''}`.trim() || error.message;
    throw new GhError((text.split('\n').find((line) => line.trim() !== '') ?? 'no output').trim());
  }
}

// An optional read: a gh failure is recorded in `unread` instead of failing
// the whole script, so one missing scope (a token without `read:project`)
// still lets every other field through.
function optional(label, unread, fallback, read) {
  try {
    return read();
  } catch (error) {
    if (!(error instanceof GhError)) throw error;
    unread.push(`${label}: ${error.message}`);
    return fallback;
  }
}

function repoRoot() {
  return execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
}

function issueTemplateNames(root) {
  const directory = path.join(root, '.github', 'ISSUE_TEMPLATE');
  try {
    return fs.readdirSync(directory).filter((name) => fs.statSync(path.join(directory, name)).isFile()).sort();
  } catch {
    return [];
  }
}

const PULL_REQUEST_TEMPLATE_PATHS = [
  '.github/pull_request_template.md',
  '.github/PULL_REQUEST_TEMPLATE.md',
  'pull_request_template.md',
  'docs/pull_request_template.md'
];

function pullRequestTemplatePath(root) {
  return PULL_REQUEST_TEMPLATE_PATHS.find((candidate) => fs.existsSync(path.join(root, candidate))) ?? null;
}

function hasOwnVocabulary(labels, types, projects) {
  if (types.length > 0) return true;
  if (labels.some((name) => !DEFAULT_LABELS.has(name))) return true;
  return projects.some((project) => project.fields.some((field) => !DEFAULT_PROJECT_FIELDS.has(field.name)));
}

function readProjectFields(owner, project, unread) {
  return optional(`project ${project.number} fields`, unread, [], () => {
    const text = gh([
      'project', 'field-list', String(project.number), '--owner', owner, '--format', 'json',
      '--jq', '[.fields[]|{id,name,options:[.options[]?|{id,name}]}]'
    ]);
    return JSON.parse(text);
  });
}

// One pass over the calls fields.md's "Read the repository" section names:
// the repo and label reads are required, everything else is optional.
function readRepository(cwd) {
  const unread = [];
  const repoJson = JSON.parse(gh(['repo', 'view', '--json', 'owner,name,defaultBranchRef']));
  const repo = { owner: repoJson.owner.login, name: repoJson.name, defaultBranch: repoJson.defaultBranchRef.name };

  const labels = JSON.parse(gh(['label', 'list', '--limit', '100', '--json', 'name', '--jq', '[.[].name]']));

  const types = optional('types', unread, [], () => {
    const query = `{repository(owner:"${repo.owner}",name:"${repo.name}"){issueTypes(first:20){nodes{name}}}}`;
    return JSON.parse(gh(['api', 'graphql', '-f', `query=${query}`, '--jq', '[.data.repository.issueTypes.nodes[].name]']));
  });

  const milestones = optional('milestones', unread, [], () => JSON.parse(
    gh(['api', `repos/${repo.owner}/${repo.name}/milestones`, '--jq', '[.[]|{number,title}]'])
  ));

  const projectList = optional('projects', unread, [], () => JSON.parse(
    gh(['project', 'list', '--owner', repo.owner, '--format', 'json', '--jq', '[.projects[]|{number,title,id}]'])
  ));
  const projects = projectList.map((project) => ({ ...project, fields: readProjectFields(repo.owner, project, unread) }));

  const titles = optional('titles', unread, [], () => JSON.parse(
    gh(['issue', 'list', '--limit', '5', '--json', 'title', '--jq', '[.[].title]'])
  ));

  const root = repoRoot();
  return {
    repo,
    labels,
    types,
    milestones,
    projects,
    issueTemplates: issueTemplateNames(root),
    prTemplate: pullRequestTemplatePath(root),
    titles,
    vocabulary: hasOwnVocabulary(labels, types, projects) ? 'own' : 'default',
    unread,
    fetchedAt: new Date().toISOString()
  };
}

function cachePath(cwd) {
  return path.join(memoryDirectory(cwd), 'fields.json');
}

// A cache that fails to parse, or carries no `fetchedAt`, is treated the
// same as no cache at all rather than as a read error.
function readCache(file) {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return typeof parsed.fetchedAt === 'string' ? parsed : null;
  } catch {
    return null;
  }
}

function isFresh(entry) {
  return Date.now() - Date.parse(entry.fetchedAt) < CACHE_TTL_MS;
}

function writeCache(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(data)}\n`);
}

function runRepoRead(refresh) {
  const cwd = process.cwd();
  const file = cachePath(cwd);
  if (!refresh) {
    const cached = readCache(file);
    if (cached && isFresh(cached)) {
      console.log(JSON.stringify(cached));
      return;
    }
  }
  let data;
  try {
    data = readRepository(cwd);
  } catch (error) {
    if (!(error instanceof GhError)) throw error;
    console.log(`fields: error gh=${error.message}`);
    process.exitCode = 3;
    return;
  }
  writeCache(file, data);
  console.log(JSON.stringify(data));
}

const SIZE_LADDER = [
  { upTo: 1, size: 'XS' },
  { upTo: 3, size: 'S' },
  { upTo: 6, size: 'M' },
  { upTo: 12, size: 'L' }
];
const ESTIMATE_BY_SIZE = { XS: 1, S: 2, M: 3, L: 8, XL: 13 };
const DEFAULT_PRIORITY = { highest: 'P0', middle: 'P1', lowest: 'P2' };

function sizeForCount(count) {
  const step = SIZE_LADDER.find((candidate) => count <= candidate.upTo);
  return step ? step.size : 'XL';
}

// A report only takes --shipped, a spec only --blocking, into the same
// four-way rank: report+shipped highest, the other report and spec+blocking
// both middle, a plain spec lowest.
function priorityCategory({ shape, shipped, blocking }) {
  if (shape === 'report') return shipped ? 'highest' : 'middle';
  if (shape === 'spec') return blocking ? 'middle' : 'lowest';
  throw new UsageError(`--shape must be 'spec' or 'report', got '${shape}'`);
}

// With options the highest is the first and the lowest the last; the middle
// is the option at Math.floor((n-1)/2), which is already index 0 for n<=2.
function priorityForCategory(category, options) {
  if (!options || options.length === 0) return DEFAULT_PRIORITY[category];
  if (category === 'highest') return options[0];
  if (category === 'lowest') return options[options.length - 1];
  return options[Math.floor((options.length - 1) / 2)];
}

/** The Size, Estimate and Priority a body's paths, criteria and shape carry. */
export function sizeFields({ paths, criteria, shape, shipped = false, blocking = false, options }) {
  const size = sizeForCount(Math.max(paths, criteria));
  const category = priorityCategory({ shape, shipped, blocking });
  return { size, estimate: ESTIMATE_BY_SIZE[size], priority: priorityForCategory(category, options) };
}

function toCount(value, name) {
  if (value === undefined || !/^\d+$/.test(value)) throw new UsageError(`--${name} needs a non-negative integer`);
  return Number(value);
}

// One flag grammar for both modes, so a stray flag from the other mode
// fails the same usage check instead of reading as "unknown flag".
function readFlags(argv) {
  return parseFlags(argv, {
    size: 'boolean',
    refresh: 'boolean',
    paths: 'value',
    criteria: 'value',
    shape: 'value',
    shipped: 'boolean',
    blocking: 'boolean',
    options: 'value'
  });
}

function sizeFlagsFrom(flags) {
  const paths = toCount(flags.paths, 'paths');
  const criteria = toCount(flags.criteria, 'criteria');
  if (flags.shape !== 'spec' && flags.shape !== 'report') {
    throw new UsageError(`--shape must be 'spec' or 'report', got '${flags.shape}'`);
  }
  const options = flags.options ? flags.options.split(',').map((option) => option.trim()) : undefined;
  return { paths, criteria, shape: flags.shape, shipped: Boolean(flags.shipped), blocking: Boolean(flags.blocking), options };
}

function main() {
  let flags;
  try {
    flags = readFlags(process.argv.slice(2));
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    console.error(`usage: repo-fields.mjs [--refresh] | --size --paths <n> --criteria <n> --shape spec|report [--shipped] [--blocking] [--options "<highest>,...,<lowest>"]: ${error.message}`);
    process.exitCode = 2;
    return;
  }
  if (flags.size) {
    let sizeFlags;
    try {
      sizeFlags = sizeFlagsFrom(flags);
    } catch (error) {
      if (!(error instanceof UsageError)) throw error;
      console.error(`usage: repo-fields.mjs --size --paths <n> --criteria <n> --shape spec|report [--shipped] [--blocking] [--options "<highest>,...,<lowest>"]: ${error.message}`);
      process.exitCode = 2;
      return;
    }
    console.log(JSON.stringify(sizeFields(sizeFlags)));
    return;
  }
  runRepoRead(Boolean(flags.refresh));
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  main();
}

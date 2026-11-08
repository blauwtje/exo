#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { memoryDirectory } from '#memory-store';
import { UsageError, parseFlags, isMain } from '#script-flags';

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const USAGE = [
  'usage: node repo-fields.mjs [--refresh]',
  '       node repo-fields.mjs --size --paths <n> --criteria <n> --shape spec|report',
  '         [--shipped] [--blocking] [--options "<highest>,...,<lowest>"]',
  'The default mode prints the repository vocabulary as one JSON line, cached for a day; --refresh bypasses the cache.',
  'A gh failure on the repo or label read exits 3. --size takes no gh call and prints one JSON line.',
  'A usage error prints nothing to stdout and exits 2.',
].join('\n');

const DEFAULT_LABELS = new Set([
  'bug', 'documentation', 'duplicate', 'enhancement', 'good first issue',
  'help wanted', 'invalid', 'question', 'wontfix'
]);
const DEFAULT_PROJECT_FIELDS = new Set([
  'Title', 'Assignees', 'Status', 'Labels', 'Linked pull requests',
  'Milestone', 'Repository', 'Reviewers', 'Parent issue', 'Sub-issues progress'
]);

class GhError extends Error {}

function gh(args) {
  try {
    return execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (error) {
    const text = `${error.stderr ?? ''}`.trim() || error.message;
    throw new GhError((text.split('\n').find((line) => line.trim() !== '') ?? 'no output').trim());
  }
}

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

function priorityCategory({ shape, shipped, blocking }) {
  if (shape === 'report') return shipped ? 'highest' : 'middle';
  if (shape === 'spec') return blocking ? 'middle' : 'lowest';
  throw new UsageError(`--shape must be 'spec' or 'report', got '${shape}'`);
}

function priorityForCategory(category, options) {
  if (!options || options.length === 0) return DEFAULT_PRIORITY[category];
  if (category === 'highest') return options[0];
  if (category === 'lowest') return options[options.length - 1];
  return options[Math.floor((options.length - 1) / 2)];
}

export function sizeFields({ paths, criteria, shape, shipped = false, blocking = false, options }) {
  const size = sizeForCount(Math.max(paths, criteria));
  const category = priorityCategory({ shape, shipped, blocking });
  return { size, estimate: ESTIMATE_BY_SIZE[size], priority: priorityForCategory(category, options) };
}

function toCount(value, name) {
  if (value === undefined || !/^\d+$/.test(value)) throw new UsageError(`--${name} needs a non-negative integer`);
  return Number(value);
}

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
  }, { usage: USAGE });
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

if (isMain(import.meta.url)) {
  main();
}

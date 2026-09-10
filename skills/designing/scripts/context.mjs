// Read a project's durable design context and report whether it still matches
// the code it was approved against. This script never writes any file, under
// any flag; --init prints a skeleton to stdout for a human to place.
//
//   node scripts/context.mjs --surface <name> --needs color,typography,controls,motion [--root <dir>]
//   node scripts/context.mjs --status [--root <dir>]
//   node scripts/context.mjs --init

import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { parseFlags, UsageError } from './capture.mjs';

const NEED_SECTIONS = {
  product: 'Product and audience',
  principles: 'Principles and visual direction',
  'anti-references': 'Anti-references',
  typography: 'Typography',
  color: 'Palette',
  spacing: 'Spacing and density',
  controls: 'Geometry and controls',
  material: 'Surface, depth, material and lighting',
  imagery: 'Icons, imagery and illustration',
  motion: 'Motion',
  responsive: 'Responsive behavior',
  implementation: 'Canonical implementation',
  exceptions: 'Surface exceptions'
};

const SKELETON = `---
schema: ui-design/v1
status: approved
last_reviewed_commit: <sha>
source_anchors:
  - <path to token source>
  - <path to component source>
---

# Design

## Product and audience
## Principles and visual direction
## Anti-references
## Typography
## Palette
## Spacing and density
## Geometry and controls
## Surface, depth, material and lighting
## Icons, imagery and illustration
## Motion
## Responsive behavior
## Canonical implementation
## Surface exceptions
`;

function runGit(root, args) {
  return new Promise((resolve) => {
    execFile('git', ['-C', root, ...args], { timeout: 30_000 }, (error, stdout, stderr) => {
      const code = error ? (typeof error.code === 'number' ? error.code : 127) : 0;
      resolve({ code, stdout: String(stdout ?? ''), stderr: String(stderr ?? error?.message ?? '') });
    });
  });
}

async function readFileOrNull(target) {
  try {
    return await fs.readFile(target, 'utf8');
  } catch {
    return null;
  }
}

export function parseFrontmatter(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!match) return { values: {}, body: text };
  const values = {};
  let listKey = null;
  for (const line of match[1].split(/\r?\n/)) {
    const item = /^\s*-\s+(.*)$/.exec(line);
    if (item && listKey) {
      values[listKey].push(item[1].trim());
      continue;
    }
    const pair = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (!pair) continue;
    if (pair[2] === '') {
      listKey = pair[1];
      values[listKey] = [];
    } else {
      listKey = null;
      values[pair[1]] = pair[2].trim();
    }
  }
  return { values, body: text.slice(match[0].length) };
}

export function selectSections(body, needs) {
  const headings = [...body.matchAll(/^##\s+(.+)$/gm)];
  const sections = headings.map((heading, index) => {
    const start = heading.index + heading[0].length;
    const end = index + 1 < headings.length ? headings[index + 1].index : body.length;
    return { heading: heading[1].trim(), body: body.slice(start, end).trim() };
  });
  const selected = [];
  const missing = [];
  for (const need of needs) {
    const canonical = NEED_SECTIONS[need];
    const match = sections.find((section) =>
      (canonical && section.heading === canonical) ||
      section.heading.toLowerCase().includes(need.toLowerCase()));
    if (match) selected.push({ need, heading: match.heading, body: match.body });
    else missing.push(need);
  }
  return { sections: selected, missing_needs: missing };
}

function anchorInsideRoot(root, anchor) {
  if (path.isAbsolute(anchor)) return false;
  const resolved = path.resolve(root, anchor);
  return resolved === root || resolved.startsWith(root + path.sep);
}

async function anchorDrift(root, anchor, commit) {
  const checks = {
    committed: ['diff', '--quiet', `${commit}..HEAD`, '--', anchor],
    staged: ['diff', '--quiet', '--cached', '--', anchor],
    unstaged: ['diff', '--quiet', '--', anchor]
  };
  const drift = { anchor, committed: false, staged: false, unstaged: false };
  for (const [name, args] of Object.entries(checks)) {
    const result = await runGit(root, args);
    // Exit codes are read strictly: 0 no drift, 1 drift, anything above 1 is a
    // tool error and must never be reported as drift.
    if (result.code > 1) return { error: `git ${name} check failed: ${result.stderr.trim()}` };
    drift[name] = result.code === 1;
  }
  return { drift };
}

export async function designStatus({ root, masterPath, frontmatter }) {
  if (!frontmatter) return { design_context_status: 'absent', reason: 'no DESIGN.md at ' + masterPath };

  const insideGit = await runGit(root, ['rev-parse', '--git-dir']);
  if (insideGit.code !== 0) {
    return { design_context_status: 'unknown', reason: `git is unavailable at ${root}: ${insideGit.stderr.trim()}` };
  }
  const commit = String(frontmatter.values.last_reviewed_commit ?? '').trim();
  if (!/^[0-9a-fA-F]{7,40}$/.test(commit)) {
    return { design_context_status: 'unknown', reason: 'front matter has no usable last_reviewed_commit' };
  }
  const exists = await runGit(root, ['cat-file', '-e', `${commit}^{commit}`]);
  if (exists.code !== 0) {
    return { design_context_status: 'unknown', reason: `last_reviewed_commit ${commit} does not resolve` };
  }
  const ancestor = await runGit(root, ['merge-base', '--is-ancestor', commit, 'HEAD']);
  if (ancestor.code !== 0) {
    return { design_context_status: 'unknown', reason: `last_reviewed_commit ${commit} is not an ancestor of HEAD` };
  }

  const anchors = Array.isArray(frontmatter.values.source_anchors) ? frontmatter.values.source_anchors : [];
  const changed = [];
  for (const anchor of anchors) {
    if (!anchorInsideRoot(root, anchor)) {
      return { design_context_status: 'unknown', reason: `source_anchor '${anchor}' escapes the project root` };
    }
    const anchorStats = await fs.stat(path.resolve(root, anchor)).catch(() => null);
    if (!anchorStats) {
      return { design_context_status: 'unknown', reason: `source_anchor '${anchor}' does not exist` };
    }
    const result = await anchorDrift(root, anchor, commit);
    if (result.error) return { design_context_status: 'unknown', reason: result.error };
    if (result.drift.committed || result.drift.staged || result.drift.unstaged) changed.push(result.drift);
  }
  if (changed.length > 0) return { design_context_status: 'potentially-stale', changed };
  return { design_context_status: 'current', changed: [] };
}

export async function readContext({ root, surface, needs }) {
  const resolvedRoot = path.resolve(root);
  const masterPath = path.join(resolvedRoot, 'docs', 'design', 'DESIGN.md');
  const masterText = await readFileOrNull(masterPath);
  const frontmatter = masterText === null ? null : parseFrontmatter(masterText);
  const status = await designStatus({ root: resolvedRoot, masterPath, frontmatter });

  const report = {
    ...status,
    root: resolvedRoot,
    sources: { master: masterPath, surface: null },
    sections: [],
    missing_needs: [],
    surface: null
  };
  if (frontmatter && needs.length > 0) {
    const selection = selectSections(frontmatter.body, needs);
    report.sections = selection.sections;
    report.missing_needs = selection.missing_needs;
  }
  if (surface) {
    const surfacePath = path.join(resolvedRoot, 'docs', 'design', 'surfaces', `${surface}.md`);
    report.sources.surface = surfacePath;
    const surfaceText = await readFileOrNull(surfacePath);
    report.surface = surfaceText === null ? null : { path: surfacePath, body: surfaceText.trim() };
  }
  return report;
}

async function main(argv) {
  const flags = parseFlags(argv, {
    surface: 'value',
    needs: 'value',
    root: 'value',
    status: 'boolean',
    init: 'boolean'
  });
  if (flags.init) {
    process.stdout.write(SKELETON);
    return;
  }
  if (flags.needs !== undefined && !flags.surface) {
    throw new UsageError('--needs requires --surface');
  }
  if (!flags.status && !flags.surface) {
    throw new UsageError('one of --surface, --status or --init is required');
  }
  if (flags.surface && !/^[A-Za-z0-9._-]+$/.test(flags.surface)) {
    throw new UsageError('--surface must be a plain file-name token');
  }
  const needs = (flags.needs ?? '').split(',').map((need) => need.trim()).filter(Boolean);
  const report = await readContext({ root: flags.root ?? process.cwd(), surface: flags.surface ?? null, needs });
  process.stdout.write(`${JSON.stringify(report)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  main(process.argv.slice(2)).catch((error) => {
    if (error instanceof UsageError) {
      process.stderr.write(`ui-design: ${error.message}\n`);
      process.exitCode = 2;
      return;
    }
    process.stderr.write(`ui-design: ${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  });
}

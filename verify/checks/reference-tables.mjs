// Every reference a skill exposes is reachable from its table, the required
// cross-skill owner rows are present with their timing predicate, every
// delegate prompt beside a SKILL.md has a row.

import fs from 'node:fs';
import path from 'node:path';
import { chainedReferences, inReferences } from './reference-chain.mjs';

const TABLE_ROW = /^\|\s*`(?<path>[^`]+\.md)`\s*\|\s*(?<readWhen>.*?)\s*\|\s*\r?$/gm;
const TABLE_HEADER = /^\| File \| Read it when \|\r?$/m;
const IMPLEMENT_ONLY = ['security.md', 'test-design.md', 'performance.md', 'data-migration.md'];

export const OWNER_ROWS_FILE = 'verify/reference-owner-rows.txt';

export function ownerRows() {
  const rows = {};
  for (const line of fs.readFileSync(OWNER_ROWS_FILE, 'utf8').split('\n')) {
    if (line.trim() === '') continue;
    const [skill, row] = line.trim().split(/\s+/);
    rows[skill] ??= [];
    if (row !== undefined) rows[skill].push(row);
  }
  return rows;
}

const EXPECTED_OWNER_ROWS = ownerRows();

// A row that defers to its target's first line points at a file whose first
// non-empty line is a read-when predicate, so the row can never name a file
// that states no predicate.
const FIRST_LINE_PREDICATE = 'When its first line applies.';
const FIRST_LINE_ROW = /first line applies/i;
const READ_WHEN_OPENING = 'Read this when ';

// The first-line predicate of each implement-only reference keeps its trigger
// list and its exclusion, so a shared row cannot widen or blur the read.
const FIRST_LINE_QUALIFIERS = {
  'security.md': [
    'changed behavior crosses authentication/authorization; tenant/resource ownership; secrets/credentials; untrusted input; network, file, or process execution; cryptography; or payments/regulated-data boundaries',
    'before ordering tasks, the first affected test, or the first production edit',
    'filenames and dependency names alone do not qualify.',
  ],
  'data-migration.md': [
    'changes a database schema, persisted-data or file format, backfill, destructive DDL, persisted-data deletion, or compatibility between concurrently deployed versions',
    'before ordering tasks or the first edit',
    'in-memory types, cache rebuilds, and version-only dependency bumps do not qualify.',
  ],
  'test-design.md': [
    'logic or public behavior changes, or an automated test is being added or changed, and the repository exposes an automated test runner',
    'before the first affected test or production edit',
    'before writing the first task of any task list, to sort tasks into risky and routine so the risky ones write their test first',
    'style, text, and version-only changes do not qualify',
    'report mode never loads it',
  ],
};

const FIRST_LINE_CONTRACTS = {
  '../build/references/security.md': FIRST_LINE_PREDICATE,
  '../build/references/data-migration.md': FIRST_LINE_PREDICATE,
  '../build/references/test-design.md': FIRST_LINE_PREDICATE,
};

const EXPECTED_CONTRACTS = {
  'skills/find-cause/SKILL.md': FIRST_LINE_CONTRACTS,
  'skills/build/SKILL.md': {
    'references/security.md': FIRST_LINE_PREDICATE,
    'references/data-migration.md': FIRST_LINE_PREDICATE,
    'references/test-design.md': FIRST_LINE_PREDICATE,
  },
  'skills/spec/SKILL.md': FIRST_LINE_CONTRACTS,
};

export function referenceTableEntries(content) {
  return [...content.matchAll(TABLE_ROW)]
    .map((match) => ({ path: match.groups.path, readWhen: match.groups.readWhen.trim() }));
}

function isFile(target) {
  return fs.existsSync(target) && fs.statSync(target).isFile();
}

function checkOwnerRows(errors, skillPath, rows) {
  const expectedRows = EXPECTED_OWNER_ROWS[skillPath];
  if (expectedRows === undefined) {
    errors.push(`${skillPath}: no expected reference-owner contract`);
    return;
  }
  const missing = expectedRows.filter((row) => !rows.includes(row));
  const extra = rows.filter((row) => !expectedRows.includes(row));
  if (rows.length !== expectedRows.length || missing.length > 0 || extra.length > 0) {
    errors.push(`${skillPath}: reference-owner rows differ; missing=${missing.join(', ')}; extra=${extra.join(', ')}`);
  }
}

function firstNonEmptyLine(target) {
  return fs.readFileSync(target, 'utf8').split(/\r?\n/).find((line) => line.trim() !== '') ?? '';
}

function checkTimingContracts(errors, skillPath, entries) {
  const contracts = EXPECTED_CONTRACTS[skillPath];
  if (contracts === undefined) return;
  for (const [target, timing] of Object.entries(contracts)) {
    const matches = entries.filter((entry) => entry.path === target);
    if (matches.length !== 1 || matches[0].readWhen !== timing) {
      errors.push(`${skillPath}: '${target}' timing/predicate contract differs`);
    }
  }
}

function checkFirstLinePredicates(errors, skillFile, skillPath, entries) {
  for (const entry of entries.filter((row) => FIRST_LINE_ROW.test(row.readWhen))) {
    const target = path.resolve(path.dirname(skillFile), entry.path);
    if (!isFile(target)) continue;
    const opening = firstNonEmptyLine(target);
    if (!opening.startsWith(READ_WHEN_OPENING)) {
      errors.push(`${skillPath}: '${entry.path}' defers to its first line, which is not a '${READ_WHEN_OPENING.trim()}' predicate`);
      continue;
    }
    const missing = (FIRST_LINE_QUALIFIERS[path.basename(target)] ?? [])
      .filter((qualifier) => !opening.includes(qualifier));
    if (missing.length > 0) {
      errors.push(`${skillPath}: '${entry.path}' first-line predicate lacks: ${missing.join(' | ')}`);
    }
  }
}

const REVIEW_RULES = 'skills/gate/references/review-rules.md';
const TRIAGE = 'skills/gate/references/triage.md';
const LATER_ROUND_RULE = 'raise `fix` only for a defect inside the fix diff';
const RED_SOURCE_RULE = 'only `Red:` source is `## Red lines` of the dispatch\'s `input=` file, else `<checkout>/.exo/review-input.md`';

function checkPrepassDemotion(errors, triage) {
  if (!triage.includes('DEMOTED-PREPASS')) errors.push(`${TRIAGE}: lacks the pre-fix probe demotion 'DEMOTED-PREPASS'`);
}

function checkReviewRules(errors, repository) {
  const triage = repository.text(path.join(repository.root, TRIAGE));
  checkPrepassDemotion(errors, triage);
  const rules = repository.text(path.join(repository.root, REVIEW_RULES));
  const probe = rules.split(/^## /m).find((section) => section.startsWith('Probe')) ?? '';
  if (!probe.includes(LATER_ROUND_RULE)) errors.push(`${REVIEW_RULES}: '## Probe' lacks the later-round rule '${LATER_ROUND_RULE}'`);
  if (!rules.includes(RED_SOURCE_RULE)) errors.push(`${REVIEW_RULES}: lacks the Red source rule '${RED_SOURCE_RULE}'`);
}

export function checkReferenceTables(report, repository) {
  const skillFiles = repository.walk(repository.skillsRoot, (file) => path.basename(file) === 'SKILL.md');
  const errors = [];
  const referenced = new Set();

  for (const skillFile of skillFiles) {
    const content = repository.text(skillFile);
    const entries = referenceTableEntries(content);
    const rows = entries.map((entry) => entry.path);
    const skillPath = repository.relative(skillFile);
    if (rows.length > 0 && !TABLE_HEADER.test(content)) {
      errors.push(`${skillPath}: missing canonical reference-table header`);
    }
    checkOwnerRows(errors, skillPath, rows);
    checkTimingContracts(errors, skillPath, entries);
    checkFirstLinePredicates(errors, skillFile, skillPath, entries);
    for (const row of rows.filter((r) => !isFile(path.resolve(path.dirname(skillFile), r)))) {
      errors.push(`${skillPath}: table target '${row}' does not resolve`);
    }
    for (const reached of chainedReferences(skillFile)) referenced.add(reached.toLowerCase());
  }

  const referenceFiles = repository.walk(repository.skillsRoot,
    (file) => inReferences(repository.skillsRoot, file));
  for (const referenceFile of [...referenceFiles, ...repository.promptFiles()]) {
    if (!referenced.has(referenceFile.toLowerCase())) {
      errors.push(`${repository.relative(referenceFile)}: no SKILL reference-table entry`);
    }
  }

  checkReviewRules(errors, repository);

  for (const name of IMPLEMENT_ONLY) {
    const matches = repository.walk(repository.skillsRoot, (file) => path.basename(file) === name);
    const expected = path.join(repository.skillsRoot, 'build', 'references', name);
    if (matches.length !== 1 || matches[0] !== expected) {
      errors.push(`${name} must exist only at skills/build/references/${name}`);
    }
  }

  const auxiliary = repository.walk(repository.skillsRoot,
    (file) => /^README.*\.md$/i.test(path.basename(file)));
  if (auxiliary.length > 0) {
    errors.push(`skill directories contain auxiliary README files: ${auxiliary.join(', ')}`);
  }

  report.assert(
    errors.length === 0,
    'reference tables',
    'all references are canonical, reachable, and progressively disclosed',
    errors.join('; ')
  );
}

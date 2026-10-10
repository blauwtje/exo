// Every reference a skill exposes is reachable from its table, the required
// cross-skill owner rows are present with their timing predicate, every
// delegate prompt beside a SKILL.md has a row, and the design-ui reference set
// matches its table file for file.

import fs from 'node:fs';
import path from 'node:path';

const TABLE_ROW = /^\|\s*`(?<path>[^`]+\.md)`\s*\|\s*(?<readWhen>.*?)\s*\|\s*\r?$/gm;
const TABLE_HEADER = /^\| File \| Read it when \|\r?$/m;
const VISUAL_DESIGN_REFERENCE_COUNT = 24;
const IMPLEMENT_ONLY = ['security.md', 'test-design.md', 'performance.md', 'data-migration.md'];

const EXPECTED_OWNER_ROWS = {
  'skills/find-cause/SKILL.md': [
    '../build/references/workspace.md',
    'investigator-prompt.md',
    'fixer-prompt.md',
    '../build/references/performance.md',
    'references/profiling.md',
    '../build/references/critique.md',
    '../build/references/security.md',
    '../build/references/data-migration.md',
    '../build/references/test-design.md',
    'references/handoff.md',
    '../build/references/project-knowledge.md',
  ],
  'skills/build/SKILL.md': [
    'references/run-loop.md',
    'references/run-loop-direct.md',
    'references/agent-cases.md',
    'references/run-loop-inline.md',
    'references/tail.md',
    'references/task-mode.md',
    'references/no-spec.md',
    'references/workspace.md',
    'references/wave-worktrees.md',
    'implementer-prompt.md',
    'bug-fixer-prompt.md',
    'review-fixer-prompt.md',
    'drift-repairer-prompt.md',
    '../route-skills/references/question.md',
    'references/design-tasks.md',
    'reviewer-prompt.md',
    'references/fresh-eyes.md',
    'references/critique.md',
    'references/security.md',
    'references/data-migration.md',
    'references/test-design.md',
    'references/test-first.md',
    'references/project-knowledge.md',
    'references/performance.md',
    'references/rolling-window.md',
  ],
  'skills/check-docs/SKILL.md': [],
  'skills/run-plan/SKILL.md': [],
  'skills/verify/SKILL.md': ['references/review-rules.md', 'references/repair.md'],
  'skills/start/SKILL.md': [
    'references/cheat-sheet.md',
  ],
  'skills/configure/SKILL.md': [
    'references/setup-map.md',
    '../route-skills/references/question.md',
  ],
  'skills/ship/SKILL.md': [
    '../file-issues/references/fields.md',
    '../route-skills/references/question.md',
    'references/pr-prep.md',
    'references/fix-ci.md',
    'references/merge-conflicts.md',
    'references/pr-comments.md',
    'references/watch.md',
  ],
  'skills/remember/SKILL.md': [
    '../route-skills/references/question.md',
    '../edit-skills/references/where-a-fix-lives.md',
  ],
  'skills/save-session/SKILL.md': [
    'references/reconstructing-without-a-note.md',
  ],
  'skills/file-issues/SKILL.md': [
    'references/fields.md',
  ],
  'skills/refactor/SKILL.md': [
    'references/behavior-pin.md',
    'references/legacy-api.md',
  ],
  'skills/spec/SKILL.md': [
    'references/stored-brief.md',
    '../route-skills/references/question.md',
    'references/brief.md',
    'references/task-list.md',
    'references/example-plan.md',
    '../build/references/data-migration.md',
    '../build/references/test-design.md',
    '../build/references/security.md',
    'references/brief-in-an-issue.md',
    '../file-issues/references/fields.md',
    'references/architecture-sketch.md',
  ],
  'skills/edit-skills/SKILL.md': [
    'references/pressure-scenarios.md',
    'references/cut-log.md',
    'references/where-a-fix-lives.md',
    'references/instruction-style.md',
    'references/wording.md',
    'references/description.md',
    'references/skill-shape.md',
    'references/plugging-holes.md',
    'references/blind-eval.md',
  ],
  'skills/design-ui/SKILL.md': [
    'references/intake.md',
    '../route-skills/references/question.md',
    'references/phase-detail.md',
    'references/phase-direction.md',
    'references/phase-build.md',
    'references/build-pass.md',
    'references/stack.md',
    'references/visual-direction.md',
    'references/sketch-tab.md',
    'references/direction-preview.md',
    'references/composition.md',
    'references/typography.md',
    'references/controls.md',
    'references/implementation.md',
    'references/motion.md',
    'references/interaction-qa.md',
    'references/feedback-and-status.md',
    'references/visual-critique.md',
    'references/craft-recipes.md',
    'references/component-system.md',
    'references/tokens.md',
    'references/icons-and-imagery.md',
    'references/accessibility.md',
    'references/performance-budget.md',
    'references/internationalization.md',
  ],
  'skills/write-docs/SKILL.md': [
    'references/ai-tics.md',
  ],
};

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

// Get-ReferenceTableEntries: the `path` | `read it when` rows of a skill's table.
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

function checkVisualDesignSet(errors, repository) {
  const skillFile = path.join(repository.skillsRoot, 'design-ui', 'SKILL.md');
  const referencesRoot = path.join(repository.skillsRoot, 'design-ui', 'references');
  const rows = referenceTableEntries(repository.text(skillFile))
    .map((entry) => entry.path)
    .filter((row) => row.startsWith('references/'))
    .map((row) => path.resolve(path.dirname(skillFile), row));
  const tabled = new Set(rows);
  const present = new Set(repository.walk(referencesRoot, (file) => file.endsWith('.md')));
  const equal = tabled.size === present.size && [...tabled].every((file) => present.has(file));
  if (present.size !== VISUAL_DESIGN_REFERENCE_COUNT || tabled.size !== VISUAL_DESIGN_REFERENCE_COUNT || !equal) {
    errors.push(`design-ui requires set equality for ${VISUAL_DESIGN_REFERENCE_COUNT} files and rows; files=${present.size}, rows=${tabled.size}`);
  }
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
    for (const row of rows) {
      const target = path.resolve(path.dirname(skillFile), row);
      if (isFile(target)) referenced.add(target.toLowerCase());
      else errors.push(`${skillPath}: table target '${row}' does not resolve`);
    }
  }

  const referenceFiles = repository.walk(repository.skillsRoot,
    (file) => file.endsWith('.md') && path.basename(path.dirname(file)) === 'references');
  for (const referenceFile of [...referenceFiles, ...repository.promptFiles()]) {
    if (!referenced.has(referenceFile.toLowerCase())) {
      errors.push(`${repository.relative(referenceFile)}: no SKILL reference-table entry`);
    }
  }

  checkVisualDesignSet(errors, repository);

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

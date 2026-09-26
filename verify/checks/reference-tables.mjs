// Every reference a skill exposes is reachable from its table, the required
// cross-skill owner rows are present with their timing predicate, every
// delegate prompt beside a SKILL.md has a row, and the design-ui reference set
// matches its table file for file.

import fs from 'node:fs';
import path from 'node:path';

const TABLE_ROW = /^\|\s*`(?<path>[^`]+\.md)`\s*\|\s*(?<readWhen>.*?)\s*\|\s*\r?$/gm;
const TABLE_HEADER = /^\| File \| Read it when \|\r?$/m;
const VISUAL_DESIGN_REFERENCE_COUNT = 22;
const IMPLEMENT_ONLY = ['security.md', 'test-design.md', 'performance.md', 'data-migration.md'];

const EXPECTED_OWNER_ROWS = {
  'skills/find-cause/SKILL.md': [
    '../run-plan/references/workspace.md',
    'investigator-prompt.md',
    'fixer-prompt.md',
    '../build-change/references/performance.md',
    'references/profiling.md',
    '../build-change/references/critique.md',
    '../build-change/references/security.md',
    '../build-change/references/data-migration.md',
    '../build-change/references/test-design.md',
  ],
  'skills/build-change/SKILL.md': [
    '../run-plan/references/workspace.md',
    'reviewer-prompt.md',
    'references/critique.md',
    'references/security.md',
    'references/data-migration.md',
    'references/test-design.md',
    'references/test-first.md',
    'references/performance.md',
    '../route-skills/references/question.md',
  ],
  'skills/audit-architecture/SKILL.md': [
    'auditor-prompt.md',
    '../define-scope/references/task-list.md',
    '../build-change/references/test-design.md',
    '../route-skills/references/question.md',
  ],
  'skills/run-plan/SKILL.md': [
    'references/workspace.md',
    'references/wave-worktrees.md',
    'implementer-prompt.md',
    'bug-fixer-prompt.md',
    'review-fixer-prompt.md',
    'drift-repairer-prompt.md',
    '../route-skills/references/question.md',
    'references/design-tasks.md',
  ],
  'skills/check-docs/SKILL.md': [],
  'skills/show-savings/SKILL.md': [],
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
    'verifier-prompt.md',
    'references/fix-ci.md',
    'references/merge-conflicts.md',
    'references/pr-comments.md',
    'references/watch.md',
  ],
  'skills/remember/SKILL.md': [
    '../route-skills/references/question.md',
    '../edit-skills/references/where-a-fix-lives.md',
  ],
  'skills/try-idea/SKILL.md': [
    'references/exhaust-the-design-space.md',
  ],
  'skills/save-session/SKILL.md': [
    'references/reconstructing-without-a-note.md',
  ],
  'skills/file-issues/SKILL.md': [
    'references/fields.md',
  ],
  'skills/explain-code/SKILL.md': [
    'references/history.md',
    'references/confidence.md',
    'references/answer-shapes.md',
  ],
  'skills/refactor/SKILL.md': [
    'references/behavior-pin.md',
    'references/legacy-api.md',
  ],
  'skills/define-scope/SKILL.md': [
    'references/stored-brief.md',
    'references/brief.md',
    'references/task-list.md',
    'references/example-plan.md',
    '../build-change/references/data-migration.md',
    '../build-change/references/test-design.md',
    '../build-change/references/security.md',
    'references/brief-in-an-issue.md',
    '../file-issues/references/fields.md',
    'references/architecture-sketch.md',
  ],
  'skills/edit-skills/SKILL.md': [
    'references/pressure-scenarios.md',
    'references/where-a-fix-lives.md',
    'references/wording.md',
    'references/description.md',
    'references/skill-shape.md',
    'references/plugging-holes.md',
    'references/blind-eval.md',
  ],
  'skills/design-ui/SKILL.md': [
    'references/intake.md',
    'references/phase-detail.md',
    'references/phase-direction.md',
    'references/phase-build.md',
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
  'skills/check-impact/SKILL.md': [
    'references/hand-back.md',
  ],
  'skills/write-docs/SKILL.md': [
    'references/ai-tics.md',
  ],
  'skills/run-parallel/SKILL.md': [
    'worker-prompt.md',
    'judge-prompt.md',
  ],
  'skills/tune-metric/SKILL.md': [
    'references/decision-log.md',
    'attempt-prompt.md',
    'auditor-prompt.md',
  ],
  'skills/compare-renders/SKILL.md': [
    'references/capture-harness.md',
  ],
};

const EXPECTED_CONTRACTS = {
  'skills/find-cause/SKILL.md': {
    '../build-change/references/security.md':
      'After Step 4 identifies the predicted change and before its first affected test or production edit, only when changed behavior crosses authentication/authorization; tenant/resource ownership; secrets/credentials; untrusted input; network, file, or process execution; cryptography; or payments/regulated-data boundaries. Filenames and dependency names alone do not qualify.',
    '../build-change/references/data-migration.md':
      'After Step 4 identifies the predicted change and before editing, only when the fix changes a database schema, persisted-data or file format, backfill, destructive DDL, persisted-data deletion, or compatibility between concurrently deployed versions. In-memory types, cache rebuilds, and version-only dependency bumps do not qualify.',
    '../build-change/references/test-design.md':
      'After reproduction and before the first affected test or production edit, only when the symptom changes logic or public behavior and the repository exposes an automated test runner. Style, text, and version-only changes do not qualify.',
  },
  'skills/build-change/SKILL.md': {
    'references/security.md':
      'After orientation and baseline, before the first affected test or production edit, only when changed behavior crosses authentication/authorization; tenant/resource ownership; secrets/credentials; untrusted input; network, file, or process execution; cryptography; or payments/regulated-data boundaries. Filenames and dependency names alone do not qualify.',
    'references/data-migration.md':
      'After orientation and before ordering, only when work changes a database schema, persisted-data or file format, backfill, destructive DDL, persisted-data deletion, or compatibility between concurrently deployed versions. In-memory types, cache rebuilds, and version-only dependency bumps do not qualify.',
    'references/test-design.md':
      'After the baseline and before adding or changing an automated test or production behavior, only when logic or public behavior changes or the request adds or changes an automated test, and the repository exposes an automated test runner. Style, text, and version-only changes do not qualify.',
  },
  'skills/define-scope/SKILL.md': {
    '../build-change/references/test-design.md':
      'Before the first task, to decide which tasks are risky and therefore write their test first.',
    '../build-change/references/data-migration.md':
      'After affected paths are known and before ordering, only when work changes a database schema, persisted-data or file format, backfill, destructive DDL, persisted-data deletion, or compatibility between concurrently deployed versions. In-memory types, cache rebuilds, and version-only dependency bumps do not qualify.',
    '../build-change/references/security.md':
      'After affected paths are known and before ordering, only when changed behavior crosses authentication/authorization; tenant/resource ownership; secrets/credentials; untrusted input; network, file, or process execution; cryptography; or payments/regulated-data boundaries. Filenames and dependency names alone do not qualify.',
  },
  'skills/audit-architecture/SKILL.md': {
    '../define-scope/references/task-list.md':
      'Before writing the plan deliverable — a planning-mode turn or an explicitly requested plan; that file alone defines the artifact\'s sections, order, and step contents. Do not load in report mode.',
  },
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
    const expected = path.join(repository.skillsRoot, 'build-change', 'references', name);
    if (matches.length !== 1 || matches[0] !== expected) {
      errors.push(`${name} must exist only at skills/build-change/references/${name}`);
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

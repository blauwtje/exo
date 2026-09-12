// Port of Test-ReferenceTables (verify.ps1:382-534) and its row helper
// (verify.ps1:362-374): every reference a skill exposes is reachable from its
// table, the required cross-skill owner rows are present with their timing
// predicate, every delegate prompt beside a SKILL.md has a row, and the designing
// reference set stays exactly sixteen files.

import fs from 'node:fs';
import path from 'node:path';

const TABLE_ROW = /^\|\s*`(?<path>[^`]+\.md)`\s*\|\s*(?<readWhen>.*?)\s*\|\s*\r?$/gm;
const TABLE_HEADER = /^\| File \| Read it when \|\r?$/m;
const VISUAL_DESIGN_REFERENCE_COUNT = 16;
const IMPLEMENT_ONLY = ['security.md', 'test-design.md', 'performance.md', 'data-migration.md'];

const EXPECTED_OWNER_ROWS = {
  'skills/debug/SKILL.md': [
    '../implementing-batch/references/performance.md',
    '../implementing-batch/references/critique.md',
    '../implementing-batch/references/security.md',
    '../implementing-batch/references/data-migration.md',
    '../implementing-batch/references/test-design.md',
  ],
  'skills/implementing-batch/SKILL.md': [
    'references/critique.md',
    'references/security.md',
    'references/data-migration.md',
    'references/test-design.md',
    'references/performance.md',
  ],
  'skills/planning/SKILL.md': [
    'references/handoff-spec.md',
    'references/example-handoff.md',
    '../implementing-batch/references/data-migration.md',
  ],
  'skills/deepen/SKILL.md': [
    '../planning/references/handoff-spec.md',
  ],
  'skills/implementing/SKILL.md': [
    'implementer-prompt.md',
    'bug-fixer-prompt.md',
    'plan-author-prompt.md',
    'spec-reviewer-prompt.md',
    'quality-reviewer-prompt.md',
    're-review-prompt.md',
  ],
  'skills/research/SKILL.md': [],
  'skills/right-sizing/SKILL.md': [],
  'skills/savings/SKILL.md': [],
  'skills/shaping/SKILL.md': [],
  'skills/skills-tool/SKILL.md': [
    'references/pressure-scenarios.md',
    'references/form-by-failure.md',
    'references/wording.md',
    'references/description.md',
    'references/skill-shape.md',
    'references/plugging-holes.md',
  ],
  'skills/designing/SKILL.md': [
    'references/visual-direction.md',
    'references/direction-preview.md',
    'references/composition.md',
    'references/typography.md',
    'references/controls.md',
    'references/implementation.md',
    'references/motion.md',
    'references/interaction-qa.md',
    'references/visual-critique.md',
    'references/craft-recipes.md',
    'references/component-system.md',
    'references/tokens.md',
    'references/icons-and-imagery.md',
    'references/accessibility.md',
    'references/performance-budget.md',
    'references/internationalization.md',
  ],
};

const EXPECTED_CONTRACTS = {
  'skills/debug/SKILL.md': {
    '../implementing-batch/references/security.md':
      'After Step 4 identifies the predicted change and before its first affected test or production edit, only when changed behavior crosses authentication/authorization; tenant/resource ownership; secrets/credentials; untrusted input; network, file, or process execution; cryptography; or payments/regulated-data boundaries. Filenames and dependency names alone do not qualify.',
    '../implementing-batch/references/data-migration.md':
      'After Step 4 identifies the predicted change and before editing, only when the fix changes a database schema, persisted-data or file format, backfill, destructive DDL, persisted-data deletion, or compatibility between concurrently deployed versions. In-memory types, cache rebuilds, and version-only dependency bumps do not qualify.',
    '../implementing-batch/references/test-design.md':
      'After reproduction and before the first affected test or production edit, only when the symptom changes logic or public behavior and the repository exposes an automated test runner. Style, text, and version-only changes do not qualify.',
  },
  'skills/implementing-batch/SKILL.md': {
    'references/security.md':
      'After orientation and baseline, before the first affected test or production edit, only when changed behavior crosses authentication/authorization; tenant/resource ownership; secrets/credentials; untrusted input; network, file, or process execution; cryptography; or payments/regulated-data boundaries. Filenames and dependency names alone do not qualify.',
    'references/data-migration.md':
      'After orientation and before ordering, only when work changes a database schema, persisted-data or file format, backfill, destructive DDL, persisted-data deletion, or compatibility between concurrently deployed versions. In-memory types, cache rebuilds, and version-only dependency bumps do not qualify.',
    'references/test-design.md':
      'After the baseline and before adding or changing an automated test or production behavior, only when logic or public behavior changes or the request adds or changes an automated test, and the repository exposes an automated test runner. Style, text, and version-only changes do not qualify.',
  },
  'skills/planning/SKILL.md': {
    '../implementing-batch/references/data-migration.md':
      'After affected paths are known and before ordering, only when work changes a database schema, persisted-data or file format, backfill, destructive DDL, persisted-data deletion, or compatibility between concurrently deployed versions. In-memory types, cache rebuilds, and version-only dependency bumps do not qualify.',
  },
  'skills/deepen/SKILL.md': {
    '../planning/references/handoff-spec.md':
      'Before writing the plan deliverable — a planning-mode turn or an explicitly requested plan; that file alone defines the artifact\'s sections, order, and step contents. Do not load in report mode.',
  },
};

// Get-ReferenceTableEntries: the `path` | `read it when` rows of a skill's table.
function referenceTableEntries(content) {
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
  const skillFile = path.join(repository.skillsRoot, 'designing', 'SKILL.md');
  const referencesRoot = path.join(repository.skillsRoot, 'designing', 'references');
  const rows = referenceTableEntries(repository.text(skillFile))
    .map((entry) => entry.path)
    .filter((row) => row.startsWith('references/'))
    .map((row) => path.resolve(path.dirname(skillFile), row));
  const tabled = new Set(rows);
  const present = new Set(repository.walk(referencesRoot, (file) => file.endsWith('.md')));
  const equal = tabled.size === present.size && [...tabled].every((file) => present.has(file));
  if (present.size !== VISUAL_DESIGN_REFERENCE_COUNT || tabled.size !== VISUAL_DESIGN_REFERENCE_COUNT || !equal) {
    errors.push(`designing requires set equality for sixteen files and rows; files=${present.size}, rows=${tabled.size}`);
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
    const expected = path.join(repository.skillsRoot, 'implementing-batch', 'references', name);
    if (matches.length !== 1 || matches[0] !== expected) {
      errors.push(`${name} must exist only at skills/implementing-batch/references/${name}`);
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

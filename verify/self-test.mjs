// The verifier's own test: mutate a throwaway copy of the corpus and require the
// verifier to reject each mutation, plus a set of benign variations it must still
// accept. A verifier nobody attacks reports green on a corpus that has rotted.
//
// Each scenario keeps its name, so a failure names the same scenario on every run.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Buffer } from 'node:buffer';
import { spawnSync } from 'node:child_process';
import process from 'node:process';

// A fixture holds everything a check reads plus the verifier itself, so the
// javascript syntax check has the same modules to parse that the real run does,
// and the Markdown files README.md links to, so its references resolve there too.
const FIXTURE_ENTRIES = [
  'skills', 'agents', 'verify', 'verify.mjs', 'README.md',
  'CONTRIBUTING.md', 'CHANGELOG.md', 'benchmarks/README.md', 'docs/skills/show-savings.md'
];

function read(root, relative) {
  return fs.readFileSync(path.join(root, relative), 'utf8');
}

function write(root, relative, text) {
  fs.writeFileSync(path.join(root, relative), text, 'utf8');
}

function append(root, relative, text) {
  fs.appendFileSync(path.join(root, relative), text, 'utf8');
}

// PowerShell's -replace and .Replace both rewrite every occurrence, so a scenario
// that names a sentence appearing twice must remove both copies here too.
function replaceText(root, relative, from, to) {
  write(root, relative, read(root, relative).replaceAll(from, to));
}

function dropLines(root, relative, prefix) {
  const kept = read(root, relative).split('\n').filter((line) => !line.startsWith(prefix));
  write(root, relative, kept.join('\n'));
}

// A scenario that gives find-cause a real effort value keeps the model table
// in step, so it exercises only the frontmatter shape rule it names.
function patchTableEffort(root, key, effort) {
  const file = path.join(root, 'verify/model-table.json');
  const table = JSON.parse(read(root, 'verify/model-table.json'));
  table[key] = { ...table[key], effort };
  fs.writeFileSync(file, `${JSON.stringify(table, null, 2)}\n`, 'utf8');
}

const SCENARIOS = [
  { name: 'invalid-yaml', mutate: (root) => write(root, 'skills/define-scope/SKILL.md',
    read(root, 'skills/define-scope/SKILL.md').replace(/^name: define-scope$/gm, 'name: [define-scope')) },
  { name: 'missing-judgment', mutate: (root) =>
    replaceText(root, 'skills/check-docs/SKILL.md', '## Judgment', '## Verdict') },
  // run-plan's body sits at its SLIM_BODY_TOKENS lock, so the stance paragraph
  // added here also trims two References descriptions by more bytes than it
  // costs: the mutation reaches the slim-shape check instead of the lock.
  { name: 'slim-skill-stance-paragraph', mutate: (root) => {
    replaceText(root, 'skills/run-plan/SKILL.md',
      '# Implementing a plan\n', '# Implementing a plan\n\nRun it. The enemy is drift. The overcorrection is stalling.\n');
    replaceText(root, 'skills/run-plan/SKILL.md',
      'Before asking the user to pick among numbered options.', 'Before asking.');
    replaceText(root, 'skills/run-plan/SKILL.md',
      'Never here: `exo:run-unit` reads it.', 'Never here.');
  } },
  // build-change's body sits at its SLIM_BODY_TOKENS lock; trimming one
  // References description offsets the added Judgment section's bytes.
  { name: 'slim-skill-judgment-section', mutate: (root) => {
    replaceText(root, 'skills/build-change/SKILL.md',
      '\n## References\n', '\n## Judgment\n\n- Stop.\n\n## References\n');
    replaceText(root, 'skills/build-change/SKILL.md',
      'Before asking the user to pick among numbered options.', 'Before asking.');
  } },
  { name: 'slim-skill-unnumbered-steps', mutate: (root) => write(root, 'skills/define-scope/SKILL.md',
    read(root, 'skills/define-scope/SKILL.md').replace(/^\d+\. /gm, '- ')) },
  { name: 'slim-skill-without-references-table', mutate: (root) =>
    replaceText(root, 'skills/find-cause/SKILL.md', '## References', '## Sources') },
  // ship's body sits at its SLIM_BODY_TOKENS lock; trimming one References
  // description offsets the added closing line's bytes.
  { name: 'slim-skill-report-not-last', mutate: (root) => {
    append(root, 'skills/ship/SKILL.md', '\nA closing line after the report.\n');
    replaceText(root, 'skills/ship/SKILL.md',
      'Resolve conflicts, in step 6 or a watch round.', 'In step 6.');
  } },
  { name: 'banned-phrase', mutate: (root) =>
    append(root, 'skills/define-scope/SKILL.md', "\nlet me know if you'd like me to continue\n") },
  { name: 'expanded-banned-language', mutate: (root) =>
    append(root, 'skills/define-scope/SKILL.md', '\nUse WebSearch when useful.\n') },
  { name: 'derived-name', mutate: (root) =>
    append(root, 'skills/define-scope/SKILL.md', `\n${Buffer.from('d2F5ZmluZGVy', 'base64')}\n`) },
  { name: 'derived-name-outside-shipped-files', mutate: (root) =>
    append(root, 'benchmarks/README.md', `\n${Buffer.from('cHN0YWNr', 'base64')}\n`) },
  { name: 'oversized-skill-body', mutate: (root) =>
    append(root, 'skills/configure/SKILL.md', `\n${'- A line no body has room for.\n'.repeat(500)}`) },
  { name: 'broken-reference', mutate: (root) =>
    replaceText(root, 'skills/build-change/SKILL.md', 'references/critique.md', 'references/missing.md') },
  { name: 'broken-prompt-link', mutate: (root) =>
    replaceText(root, 'skills/run-plan/SKILL.md', 'implementer-prompt.md', 'implementer-brief.md') },
  { name: 'removed-required-owner-row', mutate: (root) =>
    dropLines(root, 'skills/find-cause/SKILL.md', '| `../build-change/references/security.md` |') },
  { name: 'extra-ui-reference', mutate: (root) =>
    write(root, 'skills/design-ui/references/extra.md',
      '# Extra\n\nReject it. The enemy is excess. The overcorrection is omission.\n\n## Judgment\n\n- Stop.\n') },
  { name: 'dangling-script-link', mutate: (root) =>
    replaceText(root, 'skills/design-ui/references/visual-critique.md', 'scripts/check-ui.mjs', 'scripts/absent.mjs') },
  { name: 'dangling-sibling-script-link', mutate: (root) =>
    replaceText(root, 'skills/configure/SKILL.md', '../show-savings/scripts/savings.mjs', '../show-savings/scripts/absent.mjs') },
  { name: 'noncanonical-skill-replacement', mutate: (root) => {
    const nested = path.join(root, 'skills/define-scope/define-scope');
    fs.mkdirSync(nested);
    fs.renameSync(path.join(root, 'skills/define-scope/SKILL.md'), path.join(nested, 'SKILL.md'));
  } },
  { name: 'drifted-size-fact', mutate: (root) => replaceText(root, 'skills/build-change/SKILL.md',
    'over two source, test or config files change', 'over one source, test or config file changes') },
  { name: 'drifted-record-rule', mutate: (root) => replaceText(root, 'skills/build-change/SKILL.md',
    'rebuild what landed from the working-tree diff, not memory.', 'rebuild what landed from memory.') },
  { name: 'drifted-floor-number', mutate: (root) => replaceText(root, 'skills/design-ui/references/visual-direction.md',
    'verify a ratio of at least 4.5:1', 'verify a ratio of at least 4:1') },
  { name: 'define-scope-gate-back-to-a-file-count', mutate: (root) => replaceText(root, 'skills/define-scope/SKILL.md',
    'An open decision is one the user would notice that neither request nor code settles.', 'An open decision is one more file the request changes.') },
  { name: 'define-scope-gate-without-its-exit', mutate: (root) => replaceText(root, 'skills/define-scope/SKILL.md',
    'Zero open decisions means leave this skill and write no brief', 'Zero means carry on anyway') },
  { name: 'handshake-desync', mutate: (root) => replaceText(root, 'skills/define-scope/SKILL.md',
    'define-scope decides those first; design-ui follows for presentation',
    'define-scope decides these first; design-ui follows for presentation') },
  { name: 'oversized-description', mutate: (root) => replaceText(root, 'skills/check-docs/SKILL.md',
    'description: Use when a code decision', `description: ${'overlong '.repeat(140)}Use when a code decision`) },
  { name: 'model-invocable-description-without-use-when', mutate: (root) => replaceText(root, 'skills/check-docs/SKILL.md',
    'description: Use when a code decision', 'description: Use for a code decision') },
  { name: 'dropped-underdesign-contract', mutate: (root) => replaceText(root, 'skills/design-ui/SKILL.md',
    'A full or bounded redesign fails when the rendered result stays materially interchangeable with the baseline',
    'A redesign should feel fresh') },
  { name: 'dropped-bounded-redesign-trigger', mutate: (root) => replaceText(root, 'skills/design-ui/SKILL.md',
    '; or a report that an existing surface is empty, boring, generic, flat, unfinished, or not distinctive', '') },
  { name: 'dropped-expression-offer', mutate: (root) => replaceText(root, 'skills/design-ui/SKILL.md',
    'A user who leaves the look to this skill has not asked for text: rung 7 still offers.', '') },
  { name: 'widened-settled-identity', mutate: (root) => replaceText(root, 'skills/design-ui/SKILL.md',
    'A component library in the manifest is not that evidence on its own', 'A component library in the manifest is that evidence') },
  { name: 'drifted-tell-list', mutate: (root) => replaceText(root, 'skills/design-ui/references/visual-critique.md',
    '`monospace-label`, and `invented-content`', 'and `monospace-label`') },
  { name: 'drifted-sketch-labels', mutate: (root) => replaceText(root, 'skills/design-ui/references/sketch-tab.md',
    '`lost`, ', '') },
  { name: 'drifted-blocking-list', mutate: (root) => replaceText(root, 'skills/design-ui/references/phase-build.md',
    'or any `content-clipped` or `element-overlap` finding', 'or any `content-clipped` finding') },
  { name: 'dropped-plan-mode-run-guard', mutate: (root) => replaceText(root, 'skills/design-ui/references/intake.md',
    'The exception is a read-only planning mode, which runs no `scripts/direction.mjs` call', 'A read-only planning mode runs the same calls') },
  { name: 'dropped-single-cycle-ceiling', mutate: (root) => replaceText(root, 'skills/design-ui/references/phase-detail.md',
    'its repair is a new direction, not another polish pass, so the cycle ends there', 'its repair is a return to Phase 2') },
  { name: 'drifted-audit-precedence', mutate: (root) => replaceText(root, 'skills/audit-architecture/SKILL.md',
    'every other planning turn belongs to', 'planning turns belong to') },
  { name: 'effort-absent', expect: 'accept', mutate: (root) => {
    for (const skill of ['find-cause', 'audit-architecture']) dropLines(root, `skills/${skill}/SKILL.md`, 'effort:');
  } },
  { name: 'effort-low', expect: 'accept', mutate: (root) => {
    replaceText(root, 'skills/find-cause/SKILL.md', 'name: find-cause', 'name: find-cause\neffort: low');
    patchTableEffort(root, 'skills/find-cause', 'low');
  } },
  { name: 'effort-medium', expect: 'accept', mutate: (root) => {
    replaceText(root, 'skills/find-cause/SKILL.md', 'name: find-cause', 'name: find-cause\neffort: medium');
    patchTableEffort(root, 'skills/find-cause', 'medium');
  } },
  { name: 'effort-high', expect: 'accept', mutate: (root) => {
    replaceText(root, 'skills/find-cause/SKILL.md', 'name: find-cause', 'name: find-cause\neffort: high');
    patchTableEffort(root, 'skills/find-cause', 'high');
  } },
  { name: 'effort-max', expect: 'accept', mutate: (root) => {
    replaceText(root, 'skills/find-cause/SKILL.md', 'name: find-cause', 'name: find-cause\neffort: max');
    patchTableEffort(root, 'skills/find-cause', 'max');
  } },
  { name: 'effort-bogus', mutate: (root) =>
    replaceText(root, 'skills/find-cause/SKILL.md', 'name: find-cause', 'name: find-cause\neffort: bogus') },
  { name: 'model-bogus', mutate: (root) =>
    replaceText(root, 'skills/find-cause/SKILL.md', 'name: find-cause', 'name: find-cause\nmodel: bogus') },
  { name: 'effort-duplicate', mutate: (root) =>
    replaceText(root, 'skills/find-cause/SKILL.md', 'name: find-cause', 'name: find-cause\neffort: xhigh\neffort: high') },
  { name: 'effort-without-name', mutate: (root) =>
    dropLines(root, 'skills/find-cause/SKILL.md', 'name:') },
  { name: 'effort-without-description', mutate: (root) =>
    dropLines(root, 'skills/find-cause/SKILL.md', 'description:') },
  { name: 'effort-unknown-key', mutate: (root) =>
    replaceText(root, 'skills/find-cause/SKILL.md', 'name: find-cause', 'name: find-cause\nmodel-effort: high') },
  { name: 'dropped-render-evidence', mutate: (root) => replaceText(root, 'skills/design-ui/references/phase-detail.md',
    'baseline before the first edit, post-build before the critique fixes, and final after them',
    'capture the surface before and after building') },
  { name: 'dropped-evidence-sufficiency', mutate: (root) => replaceText(root, 'skills/design-ui/references/phase-detail.md',
    'never substitute a product-category aesthetic for missing evidence',
    'pick a fitting product-category aesthetic') },
  { name: 'dropped-motion-evidence-contract', mutate: (root) => replaceText(root, 'skills/design-ui/references/motion.md',
    'only exercised is motion-verified', 'a careful read of the code is enough') },
  { name: 'dropped-direction-contract-gate', mutate: (root) => replaceText(root, 'skills/design-ui/references/phase-direction.md',
    'validate the set with `--check` to status ok before building any variant',
    'render at least two variants and pick the better one') },
  { name: 'dropped-font-provenance', mutate: (root) => replaceText(root, 'skills/design-ui/references/typography.md',
    'Do not name a new typeface from memory.', 'Choose a face you know works.') },
  { name: 'dropped-quiet-region-jobs', mutate: (root) => replaceText(root, 'skills/design-ui/references/visual-direction.md',
    'Every planned quiet region carries one named job', 'Large quiet regions are fine as breathing room') },
  { name: 'broken-skill-script', mutate: (root) =>
    append(root, 'skills/design-ui/scripts/capture.mjs', '\nexport function broken( {\n') },
  { name: 'copied-data-migration', mutate: (root) => write(root, 'skills/define-scope/references/data-migration.md',
    read(root, 'skills/build-change/references/data-migration.md')) },
  { name: 'uncapped-delegate-report', mutate: (root) =>
    replaceText(root, 'agents/fetch-docs.md', 'at most 25 lines', 'a short report') },
  { name: 'body-over-token-ceiling', mutate: (root) =>
    append(root, 'skills/configure/SKILL.md', '- A line no body has room for.\n'.repeat(250)) },
  { name: 'description-over-ceiling', mutate: (root) => write(root, 'skills/check-docs/SKILL.md',
    read(root, 'skills/check-docs/SKILL.md').replace('description: ', `description: ${'padding '.repeat(15)}`)) },
  { name: 'reference-chain', mutate: (root) =>
    append(root, 'skills/edit-skills/references/description.md', '\nRead `wording.md` next.\n') },
  { name: 'long-reference-without-contents', mutate: (root) =>
    append(root, 'skills/edit-skills/references/where-a-fix-lives.md', '- filler line\n'.repeat(90)) },
  { name: 'empty-read-when', mutate: (root) => write(root, 'skills/edit-skills/SKILL.md',
    read(root, 'skills/edit-skills/SKILL.md').replace(/^(\| `references\/plugging-holes\.md` \|)[^\n]*\|$/m, '$1  |')) },
  { name: 'long-reference-with-contents', expect: 'accept', mutate: (root) => {
    const relative = 'skills/edit-skills/references/where-a-fix-lives.md';
    const contents = [
      '## Contents', '',
      '- [Take the first home that fits](#take-the-first-home-that-fits)',
      '- [What each home costs](#what-each-home-costs)',
      '- [A rule that has to be prose](#a-rule-that-has-to-be-prose)',
      '- [Judgment](#judgment)', '', ''
    ].join('\n');
    const text = read(root, relative).replace('## Take the first home that fits', `${contents}## Take the first home that fits`);
    write(root, relative, `${text}${'- filler line\n'.repeat(90)}`);
  } },
  { name: 'injected-body-over-ceiling', mutate: (root) =>
    append(root, 'skills/route-skills/SKILL.md', '- A line the injected body has no room for.\n'.repeat(30)) },
  { name: 'drifted-review-threshold', mutate: (root) =>
    replaceText(root, 'README.md', '200 changed lines', '250 changed lines') },
  { name: 'drifted-wait-bound', mutate: (root) =>
    replaceText(root, 'skills/ship/SKILL.md', 'stops after 20 minutes', 'stops after 30 minutes') },
  { name: 'drifted-retention-days', mutate: (root) =>
    replaceText(root, 'README.md', 'last 30 days', 'last 60 days') },
  { name: 'unprefixed-delegate-budget-key', mutate: (root) =>
    replaceText(root, 'skills/show-savings/assets/delegate-budgets.json', '"exo:build-ui"', '"build-ui"') },
];

function copyVerificationFixture(repository, destination) {
  fs.mkdirSync(destination);
  for (const entry of FIXTURE_ENTRIES) {
    fs.cpSync(repository.join(entry), path.join(destination, entry), { recursive: true });
  }
}

export function runSelfTest(report, repository) {
  const verifier = path.resolve(import.meta.dirname, '..', 'verify.mjs');
  const selfRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-skills-selftest-'));
  const failures = [];
  try {
    for (const scenario of SCENARIOS) {
      const caseRoot = path.join(selfRoot, scenario.name);
      copyVerificationFixture(repository, caseRoot);
      scenario.mutate(caseRoot);
      const run = spawnSync(process.execPath, [verifier, '--repository-root', caseRoot], {
        encoding: 'utf8'
      });
      const expect = scenario.expect ?? 'reject';
      if (expect === 'reject' && run.status === 0) {
        failures.push(`${scenario.name} was not rejected`);
      } else if (expect === 'accept' && run.status !== 0) {
        const output = `${run.stdout ?? ''}${run.stderr ?? ''}`.split('\n').join(' ').trim();
        failures.push(`${scenario.name} was rejected: ${output}`);
      }
    }
  } finally {
    // mkdtempSync created this directory, so the recursive removal cannot reach
    // anything the run did not make.
    fs.rmSync(selfRoot, { recursive: true, force: true });
  }
  report.assert(
    failures.length === 0,
    'verifier self-test',
    `${SCENARIOS.length} scenarios behaved as expected`,
    failures.join('; ')
  );
}

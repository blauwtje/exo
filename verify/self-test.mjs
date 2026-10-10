// The verifier's own test: mutate a throwaway copy of the corpus and require
// each mutation to be rejected by exactly the check or checks its scenario names,
// plus a set of benign variations the verifier must still accept. A verifier nobody attacks reports green on a corpus that has rotted.
//
// Each scenario keeps its name, so a failure names the same scenario on every run.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Buffer } from 'node:buffer';
import { spawn } from 'node:child_process';
import process from 'node:process';

// A fixture holds everything a check reads plus the verifier itself, so the
// javascript syntax check has the same modules to parse that the real run does,
// and the Markdown files README.md links to, so its references resolve there too.
const FIXTURE_ENTRIES = [
  'skills', 'agents', 'verify', 'verify.mjs', 'README.md',
  'ABOUT.md', 'CONTRIBUTING.md', 'CHANGELOG.md', 'benchmarks/README.md',
  'docs/skills/build.md', 'docs/codex.md', 'docs/settings.md', 'lib/model-kinds.json', 'harnesses',
  'hooks', 'lib/hook-input.mjs',
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

function beforeReport(root, relative, line) {
  write(root, relative, read(root, relative).replace(/\nReport: /, `\n${line}\n\nReport: `));
}

// A reference at its REFERENCE_TOKEN_LOCKS lock trips the lock as an unannounced
// shrink when a mutation removes text; padding the removed bytes back onto the
// file keeps the mutation aimed at the check it names.
function padBack(root, relative, before) {
  const shrunk = Buffer.byteLength(before, 'utf8') - Buffer.byteLength(read(root, relative), 'utf8');
  write(root, relative, `${read(root, relative)}\n${'x'.repeat(Math.max(shrunk - 2, 0))}\n`);
}

// Removes text from a locked reference and pads the bytes back, see padBack.
function dropFromLockedReference(root, relative, text) {
  const before = read(root, relative);
  replaceText(root, relative, text, '');
  padBack(root, relative, before);
}

const SCENARIOS = [
  { name: 'invalid-yaml', check: 'YAML frontmatter', mutate: (root) => write(root, 'skills/spec/SKILL.md',
    read(root, 'skills/spec/SKILL.md').replace(/^name: spec$/gm, 'name: [spec')) },
  { name: 'missing-judgment', check: 'process structure', mutate: (root) =>
    replaceText(root, 'skills/check-docs/SKILL.md', '## Judgment', '## Verdict') },
  // A step reference carries neither check, so stripping both from one leaves
  // the file valid; only SKILL.md still needs them (see missing-judgment above).
  { name: 'step-reference-without-stance-or-judgment', expect: 'accept', mutate: (root) => {
    const file = 'skills/build/references/critique.md';
    const before = read(root, file);
    replaceText(root, file,
      'Judge the delivered diff against the request before judging its internal elegance. The enemy is author anchoring: the diff matches the reasoning that produced it while drifting from the request. The overcorrection is context-free review that rejects settled decisions or invents new scope.',
      'Judge the delivered diff against the request before judging its internal elegance.');
    replaceText(root, file, '## Judgment', '## Wrap-up');
    // critique.md sits at its REFERENCE_TOKEN_LOCKS lock.
    padBack(root, file, before);
  } },
  // build's body sits at its STAGE_BODY_TOKENS lock, so the stance paragraph
  // added here also trims three References descriptions by more bytes than it
  // costs: the mutation reaches the slim-shape check instead of the lock.
  { name: 'slim-skill-stance-paragraph', check: 'process structure', mutate: (root) => {
    replaceText(root, 'skills/build/SKILL.md',
      '# Implementing a plan\n', '# Implementing a plan\n\nRun it. The enemy is drift. The overcorrection is stalling.\n');
    replaceText(root, 'skills/build/SKILL.md',
      'Before asking the user to pick.', 'Before asking.');
    replaceText(root, 'skills/build/SKILL.md',
      'No spec step 7, last fallback.', 'No spec step 7.');
    replaceText(root, 'skills/build/SKILL.md',
      'Never here: the unit reads it.', 'Never here.');
  } },
  // build's body sits at its STAGE_BODY_TOKENS lock; trimming two
  // References descriptions offsets the added Judgment section's bytes.
  { name: 'slim-skill-judgment-section', check: 'process structure', mutate: (root) => {
    replaceText(root, 'skills/build/SKILL.md',
      '\n## References\n', '\n## Judgment\n\n- Stop.\n\n## References\n');
    replaceText(root, 'skills/build/SKILL.md',
      'Before asking the user to pick.', 'Before asking.');
    replaceText(root, 'skills/build/SKILL.md',
      'No spec step 7, last fallback.', 'No spec step 7.');
  } },
  { name: 'slim-skill-unnumbered-steps', check: 'process structure', mutate: (root) => write(root, 'skills/spec/SKILL.md',
    read(root, 'skills/spec/SKILL.md').replace(/^\d+\. /gm, '- ')) },
  // build's body sits at its STAGE_BODY_TOKENS lock; the three trims below pay
  // for the inserted paragraph, so the mutation reaches the opening-heading
  // check instead of the byte lock.
  { name: 'slim-skill-heading-opens-on-paragraph', check: 'process structure', mutate: (root) => {
    replaceText(root, 'skills/build/SKILL.md',
      '## The loop\n', '## The loop\n\nIt runs until the plan lands or a repair pass ends it.\n');
    replaceText(root, 'skills/build/SKILL.md',
      'Before asking the user to pick.', 'Before asking.');
    replaceText(root, 'skills/build/SKILL.md',
      'No spec step 7, last fallback.', 'No spec step 7.');
    replaceText(root, 'skills/build/SKILL.md',
      'Never here: the unit reads it.', 'Never here.');
  } },
  { name: 'slim-skill-without-references-table', check: 'process structure', mutate: (root) =>
    replaceText(root, 'skills/find-cause/SKILL.md', '## References', '## Sources') },
  // ship's body sits at its STAGE_BODY_TOKENS lock; trimming one References
  // description offsets the added closing line's bytes.
  { name: 'slim-skill-report-not-last', check: 'process structure', mutate: (root) => {
    append(root, 'skills/ship/SKILL.md', '\nA closing line after the report.\n');
    replaceText(root, 'skills/ship/SKILL.md',
      'Conflicts, step 6 or watch.', 'Step 6.');
  } },
  // A second copy of the whole References block outgrows verify's
  // STAGE_BODY_TOKENS lock and doubles its table rows, so the duplicate is the
  // heading alone, which the duplicate check alone rejects.
  { name: 'skill-repeats-references-section', check: 'process structure', mutate: (root) =>
    replaceText(root, 'skills/verify/SKILL.md', '\n## References\n', '\n## References\n\n## References\n') },
  // A slim skill ends on its Report line, so each line below goes in before it.
  { name: 'banned-phrase', check: 'portable language', mutate: (root) =>
    beforeReport(root, 'skills/spec/SKILL.md', "let me know if you'd like me to continue") },
  { name: 'expanded-banned-language', check: 'portable language', mutate: (root) =>
    beforeReport(root, 'skills/spec/SKILL.md', 'Use WebSearch when useful.') },
  { name: 'derived-name', check: 'derivation', mutate: (root) =>
    beforeReport(root, 'skills/spec/SKILL.md', `${Buffer.from('d2F5ZmluZGVy', 'base64')}`) },
  { name: 'derived-name-outside-shipped-files', check: 'derivation', mutate: (root) =>
    append(root, 'benchmarks/README.md', `\n${Buffer.from('cHN0YWNr', 'base64')}\n`) },
  { name: 'oversized-skill-body', check: 'skill body budgets', mutate: (root) =>
    append(root, 'skills/configure/SKILL.md', `\n${'- A line no body has room for.\n'.repeat(500)}`) },
  // The link scenarios break a prose link: a References row is also owned by
  // the reference tables check. run-loop-direct.md sits at its
  // REFERENCE_TOKEN_LOCKS lock, so its broken name keeps the byte length.
  { name: 'broken-reference', check: 'Markdown references', mutate: (root) =>
    replaceText(root, 'skills/build/SKILL.md', 'follows `references/no-spec.md`', 'follows `references/missing.md`') },
  { name: 'broken-prompt-link', check: 'Markdown references', mutate: (root) =>
    replaceText(root, 'skills/build/references/run-loop-direct.md', '`../implementer-prompt.md`', '`../implementer-briefs.md`') },
  { name: 'removed-required-owner-row', check: 'reference tables', mutate: (root) =>
    dropLines(root, 'skills/find-cause/SKILL.md', '| `../build/references/security.md` |') },
  // These references sit at their REFERENCE_TOKEN_LOCKS locks.
  { name: 'dropped-security-ordering-window', check: 'reference tables', mutate: (root) => dropFromLockedReference(root,
    'skills/build/references/security.md',
    'and before ordering tasks, the first affected test, or the first production edit ') },
  { name: 'dropped-data-migration-ordering-window', check: 'reference tables', mutate: (root) => dropFromLockedReference(root,
    'skills/build/references/data-migration.md',
    'and before ordering tasks or the first edit ') },
  { name: 'dropped-test-design-plan-mode-clause', check: 'reference tables', mutate: (root) => dropFromLockedReference(root,
    'skills/build/references/test-design.md',
    '; or before writing the first task of any task list, to sort tasks into risky and routine so the risky ones write their test first') },
  { name: 'dropped-test-design-report-mode-exclusion', check: 'reference tables', mutate: (root) => dropFromLockedReference(root,
    'skills/build/references/test-design.md',
    ', and report mode never loads it') },
  { name: 'extra-ui-reference', check: 'reference tables', mutate: (root) =>
    write(root, 'skills/design-ui/references/extra.md',
      '# Extra\n\nReject it. The enemy is excess. The overcorrection is omission.\n\n## Judgment\n\n- Stop.\n') },
  { name: 'dangling-script-link', check: 'skill scripts', mutate: (root) =>
    replaceText(root, 'skills/design-ui/references/visual-critique.md', 'scripts/check-ui.mjs', 'scripts/absent.mjs') },
  // The broken name keeps the byte length, so ship's body budget is unaffected.
  { name: 'dangling-sibling-script-link', check: 'skill scripts', mutate: (root) =>
    replaceText(root, 'skills/ship/SKILL.md', '../remember/scripts/memory.mjs', '../remember/scripts/absent.mjs') },
  // Every check that reads a SKILL.md treats the nested copy as a process file
  // whose relative links and owner contract no longer resolve, and routing loses spec.
  { name: 'noncanonical-skill-replacement',
    check: ['skill set', 'process structure', 'Markdown references', 'routing', 'reference tables'], mutate: (root) => {
    const nested = path.join(root, 'skills/spec/spec');
    fs.mkdirSync(nested);
    fs.renameSync(path.join(root, 'skills/spec/SKILL.md'), path.join(nested, 'SKILL.md'));
  } },
  { name: 'drifted-size-fact', check: 'shared contracts', mutate: (root) => replaceText(root, 'skills/build/SKILL.md',
    'over two source, test or config files change', 'over one source, test or config file changes') },
  { name: 'drifted-record-rule', check: 'shared contracts', mutate: (root) => replaceText(root, 'skills/build/SKILL.md',
    'rebuild what landed from the working-tree diff, not memory.', 'rebuild what landed from memory.') },
  { name: 'drifted-floor-number', check: 'shared contracts', mutate: (root) => replaceText(root, 'skills/design-ui/references/visual-direction.md',
    'verify a ratio of at least 4.5:1', 'verify a ratio of at least 4:1') },
  { name: 'spec-gate-back-to-a-file-count', check: 'shared contracts', mutate: (root) => replaceText(root, 'skills/spec/SKILL.md',
    'An open decision is one the user would notice that neither request nor code settles.', 'An open decision is one more file the request changes.') },
  { name: 'spec-gate-without-its-exit', check: 'shared contracts', mutate: (root) => replaceText(root, 'skills/spec/SKILL.md',
    'Spec always ends on a brief; with no open decision the brief still gets written.', 'Spec writes a brief only when a decision is open.') },
  { name: 'dropped-handshake', check: 'shared contracts', mutate: (root) => replaceText(root, 'skills/spec/SKILL.md',
    'When a new visual surface does not name its data or behavior, spec decides those first; design-ui follows for presentation. ', '') },
  // Past 1024 characters the frontmatter and Codex checks reject it too, so
  // the padding stays between the 250-character budget and that cap.
  { name: 'oversized-description', check: 'description budgets', mutate: (root) => replaceText(root, 'skills/check-docs/SKILL.md',
    'description: Use when a code decision', `description: ${'overlong '.repeat(20)}Use when a code decision`) },
  { name: 'model-invocable-description-without-use-when', check: 'YAML frontmatter', mutate: (root) => replaceText(root, 'skills/find-cause/SKILL.md',
    'description: Use when behavior is reported wrong', 'description: Use for behavior reported wrong') },
  { name: 'dropped-underdesign-contract', check: 'shared contracts', mutate: (root) => replaceText(root, 'skills/design-ui/SKILL.md',
    'A full or bounded redesign fails when the rendered result stays materially interchangeable with the baseline',
    'A redesign should feel fresh') },
  { name: 'dropped-bounded-redesign-trigger', check: 'shared contracts', mutate: (root) => replaceText(root, 'skills/design-ui/SKILL.md',
    '; or a report that an existing surface is empty, boring, generic, flat, unfinished, or not distinctive', '') },
  { name: 'dropped-opt-in-offer', check: 'shared contracts', mutate: (root) => replaceText(root, 'skills/design-ui/SKILL.md',
    'Only a request from the user opens the picker: a landing page or an open identity does not.', '') },
  { name: 'widened-settled-identity', check: 'shared contracts', mutate: (root) => replaceText(root, 'skills/design-ui/SKILL.md',
    'A component library in the manifest is not that evidence on its own', 'A component library in the manifest is that evidence') },
  { name: 'drifted-tell-list', check: 'shared contracts', mutate: (root) => replaceText(root, 'skills/design-ui/references/build-pass.md',
    '`invented-content`, `hard-offset-shadow`.', '`invented-content`.') },
  { name: 'dropped-asset-tell', check: 'shared contracts', mutate: (root) => replaceText(root, 'skills/design-ui/assets/check-ui-findings.json',
    '"monospace-label", ', '') },
  { name: 'drifted-sketch-labels', check: 'shared contracts', mutate: (root) => replaceText(root, 'skills/design-ui/references/sketch-tab.md',
    '`lost`, ', '') },
  { name: 'drifted-blocking-list', check: 'shared contracts', mutate: (root) => replaceText(root, 'skills/design-ui/references/phase-build.md',
    'or any `content-clipped` or `element-overlap` finding', 'or any `content-clipped` finding') },
  { name: 'dropped-plan-mode-run-guard', check: 'shared contracts', mutate: (root) => replaceText(root, 'skills/design-ui/references/phase-direction.md',
    'A read-only planning mode runs no `scripts/direction.mjs` call', 'A read-only planning mode runs the same calls') },
  { name: 'dropped-single-cycle-ceiling', check: 'shared contracts', mutate: (root) => replaceText(root, 'skills/design-ui/references/phase-detail.md',
    'its repair is a new direction, not another polish pass, so the cycle ends there', 'its repair is a return to Phase 2') },
  { name: 'effort-absent', expect: 'accept', mutate: (root) => {
    for (const skill of ['find-cause']) dropLines(root, `skills/${skill}/SKILL.md`, 'effort:');
  } },
  { name: 'effort-low', expect: 'accept', mutate: (root) => {
    replaceText(root, 'skills/find-cause/SKILL.md', 'name: find-cause', 'name: find-cause\neffort: low');
  } },
  { name: 'effort-medium', expect: 'accept', mutate: (root) => {
    replaceText(root, 'skills/find-cause/SKILL.md', 'name: find-cause', 'name: find-cause\neffort: medium');
  } },
  { name: 'effort-high', expect: 'accept', mutate: (root) => {
    replaceText(root, 'skills/find-cause/SKILL.md', 'name: find-cause', 'name: find-cause\neffort: high');
  } },
  { name: 'effort-max', expect: 'accept', mutate: (root) => {
    replaceText(root, 'skills/find-cause/SKILL.md', 'name: find-cause', 'name: find-cause\neffort: max');
  } },
  { name: 'effort-bogus', check: 'YAML frontmatter', mutate: (root) =>
    replaceText(root, 'skills/find-cause/SKILL.md', 'name: find-cause', 'name: find-cause\neffort: bogus') },
  { name: 'model-bogus', check: 'YAML frontmatter', mutate: (root) =>
    replaceText(root, 'skills/find-cause/SKILL.md', 'name: find-cause', 'name: find-cause\nmodel: bogus') },
  { name: 'effort-duplicate', check: 'YAML frontmatter', mutate: (root) =>
    replaceText(root, 'skills/find-cause/SKILL.md', 'name: find-cause', 'name: find-cause\neffort: xhigh\neffort: high') },
  // The Codex generator requires name and description too, so both checks reject it.
  { name: 'effort-without-name', check: ['YAML frontmatter', 'codex overrides'], mutate: (root) =>
    dropLines(root, 'skills/find-cause/SKILL.md', 'name:') },
  // The Codex generator requires name and description too, so both checks reject it.
  { name: 'effort-without-description', check: ['YAML frontmatter', 'codex overrides'], mutate: (root) =>
    dropLines(root, 'skills/find-cause/SKILL.md', 'description:') },
  { name: 'effort-unknown-key', check: 'YAML frontmatter', mutate: (root) =>
    replaceText(root, 'skills/find-cause/SKILL.md', 'name: find-cause', 'name: find-cause\nmodel-effort: high') },
  { name: 'dropped-render-evidence', check: 'shared contracts', mutate: (root) => replaceText(root, 'skills/design-ui/references/phase-detail.md',
    'baseline before the first edit, post-build before the critique fixes, and final after them',
    'capture the surface before and after building') },
  { name: 'dropped-evidence-sufficiency', check: 'shared contracts', mutate: (root) => replaceText(root, 'skills/design-ui/references/phase-detail.md',
    'never substitute a product-category aesthetic for missing evidence',
    'pick a fitting product-category aesthetic') },
  { name: 'dropped-motion-evidence-contract', check: 'shared contracts', mutate: (root) => replaceText(root, 'skills/design-ui/references/motion.md',
    'only exercised is motion-verified', 'a careful read of the code is enough') },
  { name: 'dropped-direction-contract-gate', check: 'shared contracts', mutate: (root) => replaceText(root, 'skills/design-ui/references/phase-direction.md',
    'validate the set with `--check` to status ok before building any variant',
    'render at least two variants and pick the better one') },
  { name: 'dropped-font-provenance', check: 'shared contracts', mutate: (root) => replaceText(root, 'skills/design-ui/references/typography.md',
    'Record family, provenance `chosen`, the matched traits as `matchEvidence`', 'Record the family') },
  { name: 'dropped-quiet-region-jobs', check: 'shared contracts', mutate: (root) => replaceText(root, 'skills/design-ui/references/visual-direction.md',
    'Every planned quiet region carries one named job', 'Large quiet regions are fine as breathing room') },
  // Both checks run node --check on a skill script, so both reject it.
  { name: 'broken-skill-script', check: ['skill scripts', 'javascript syntax'], mutate: (root) =>
    append(root, 'skills/design-ui/scripts/capture.mjs', '\nexport function broken( {\n') },
  // The one-home rule matches the file name alone; half the copy keeps the new
  // reference under its token ceiling, which the whole copy exceeds.
  { name: 'copied-data-migration', check: 'reference tables', mutate: (root) => {
    const lines = read(root, 'skills/build/references/data-migration.md').split('\n');
    write(root, 'skills/spec/references/data-migration.md', lines.slice(0, Math.ceil(lines.length / 2)).join('\n'));
  } },
  { name: 'uncapped-delegate-report', check: 'delegate return caps', mutate: (root) =>
    replaceText(root, 'agents/fetch-docs.md', 'at most 25 lines', 'a short report') },
  { name: 'body-over-token-ceiling', check: 'skill body budgets', mutate: (root) =>
    append(root, 'skills/configure/SKILL.md', '- A line no body has room for.\n'.repeat(250)) },
  { name: 'agent-body-over-token-ceiling', check: 'skill body budgets', mutate: (root) =>
    append(root, 'agents/locate-code.md', '- A line no agent body has room for.\n'.repeat(150)) },
  // critique.md sits at its REFERENCE_TOKEN_LOCKS lock, so any growth pushes
  // it over: the mutation reaches the lock instead of the general ceiling.
  { name: 'reference-over-token-lock', check: 'reference shape', mutate: (root) =>
    append(root, 'skills/build/references/critique.md', '- A line no locked reference has room for.\n') },
  { name: 'description-over-ceiling', check: 'description budgets', mutate: (root) => write(root, 'skills/check-docs/SKILL.md',
    read(root, 'skills/check-docs/SKILL.md').replace('description: ', `description: ${'padding '.repeat(15)}`)) },
  { name: 'reference-chain', check: 'reference shape', mutate: (root) =>
    append(root, 'skills/edit-skills/references/description.md', '\nRead `wording.md` next.\n') },
  { name: 'long-reference-without-contents', check: 'reference shape', mutate: (root) =>
    append(root, 'skills/edit-skills/references/where-a-fix-lives.md', '- filler line\n'.repeat(90)) },
  { name: 'empty-read-when', check: 'reference shape', mutate: (root) => write(root, 'skills/edit-skills/SKILL.md',
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
  { name: 'injected-body-over-ceiling', check: 'skill body budgets', mutate: (root) =>
    append(root, 'skills/route-skills/SKILL.md', '- A line the injected body has no room for.\n'.repeat(30)) },
  { name: 'drifted-review-threshold', check: 'shared contracts', mutate: (root) =>
    replaceText(root, 'CONTRIBUTING.md', 'a manifest or lockfile changed', 'a manifest changed') },
  { name: 'drifted-wait-bound', check: 'shared contracts', mutate: (root) =>
    replaceText(root, 'skills/ship/SKILL.md', 'stops after 20 minutes', 'stops after 30 minutes') },
];

function copyVerificationFixture(repository, destination) {
  fs.mkdirSync(destination);
  for (const entry of FIXTURE_ENTRIES) {
    fs.cpSync(repository.join(entry), path.join(destination, entry), { recursive: true });
  }
}

// The scripts a scenario changed, so the verifier run inside its fixture parses
// only those: every other script is a byte-for-byte copy the parent run already parsed.
function changedScripts(repository, caseRoot) {
  const changed = [];
  for (const file of repository.walk(caseRoot, (full) => full.endsWith('.mjs'))) {
    const relative = path.relative(caseRoot, file);
    const original = path.join(repository.root, relative);
    if (!fs.existsSync(original) || fs.readFileSync(original, 'utf8') !== fs.readFileSync(file, 'utf8')) {
      changed.push(relative);
    }
  }
  return changed;
}

function runVerifier(verifier, caseRoot, changed) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [verifier, '--repository-root', caseRoot, `--changed-scripts=${changed.join('\n')}`]);
    let output = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { output += chunk; });
    child.on('error', reject);
    child.on('close', (status) => resolve({ status, output }));
  });
}

// The distinct checks a verifier run failed, by the label each `[FAIL] <check>: <detail>` line carries.
export function failedChecks(output) {
  return [...new Set([...output.matchAll(/^\[FAIL\] (.+?): /gm)].map((match) => match[1]))];
}

// Returns the failure text for one scenario, or null when it behaved as expected.
// A reject scenario names the check that must reject it, or the exact list of
// checks where one rule is enforced twice: a rejection by any other check proves
// nothing about the check the mutation attacks.
export function judgeScenario(scenario, run) {
  if (scenario.expect === 'accept') {
    if (run.status === 0) return null;
    return `${scenario.name} was rejected: ${run.output.split('\n').join(' ').trim()}`;
  }
  const failed = failedChecks(run.output);
  const actual = failed.length === 0 ? 'none' : failed.join(', ');
  const expected = [...new Set([scenario.check ?? []].flat())];
  if (expected.length === 0) return `${scenario.name} names no check to reject it (failed: ${actual})`;
  const exact = failed.length === expected.length && expected.every((check) => failed.includes(check));
  if (run.status !== 0 && exact) return null;
  return `${scenario.name} expected exactly ${expected.join(', ')} to fail (failed: ${actual})`;
}

// Returns the failure text for one scenario, or null when it behaved as expected.
async function runScenario(scenario, verifier, repository, selfRoot) {
  const caseRoot = path.join(selfRoot, scenario.name);
  copyVerificationFixture(repository, caseRoot);
  scenario.mutate(caseRoot);
  const run = await runVerifier(verifier, caseRoot, changedScripts(repository, caseRoot));
  return judgeScenario(scenario, run);
}

export async function runSelfTest(report, repository) {
  const verifier = path.resolve(import.meta.dirname, '..', 'verify.mjs');
  const selfRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-skills-selftest-'));
  // One slot per scenario keeps the results in scenario order however the runs finish.
  const outcomes = new Array(SCENARIOS.length).fill(null);
  let next = 0;
  async function worker() {
    while (next < SCENARIOS.length) {
      const index = next;
      next += 1;
      outcomes[index] = await runScenario(SCENARIOS[index], verifier, repository, selfRoot);
    }
  }
  try {
    await Promise.all(Array.from({ length: os.availableParallelism() }, worker));
  } finally {
    // mkdtempSync created this directory, so the recursive removal cannot reach
    // anything the run did not make.
    fs.rmSync(selfRoot, { recursive: true, force: true });
  }
  const failures = outcomes.filter((outcome) => outcome !== null);
  report.assert(
    failures.length === 0,
    'verifier self-test',
    `${SCENARIOS.length} scenarios behaved as expected`,
    failures.join('; ')
  );
}

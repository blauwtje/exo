// The verifier's own test: mutate a throwaway copy of the corpus and require the
// verifier to reject each mutation, plus a set of benign variations it must still
// accept. A verifier nobody attacks reports green on a corpus that has rotted.
//
// Port of Invoke-VerifierSelfTest (verify.ps1:1482-1758) and its fixture copy
// (verify.ps1:1471-1480). Scenario order and names are preserved so a failure names
// the same scenario in both runners.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import process from 'node:process';

// A fixture holds everything a check reads plus the verifier itself, so the
// javascript syntax check has the same modules to parse that the real run does.
const FIXTURE_ENTRIES = ['skills', 'agents', 'verify', 'verify.mjs', 'README.md'];

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

const SCENARIOS = [
  { name: 'invalid-yaml', mutate: (root) => write(root, 'skills/shaping/SKILL.md',
    read(root, 'skills/shaping/SKILL.md').replace(/^name: shaping$/gm, 'name: [shaping')) },
  { name: 'line-overflow', mutate: (root) =>
    append(root, 'skills/implementing-batch/references/performance.md', '\nextra'.repeat(100)) },
  // A file in LINE_BUDGETS must hit its own ceiling, not an exemption.
  { name: 'budgeted-line-overflow', mutate: (root) =>
    append(root, 'skills/planning/references/example-handoff.md', 'extra\n'.repeat(15)) },
  { name: 'missing-judgment', mutate: (root) =>
    replaceText(root, 'skills/research/SKILL.md', '## Judgment', '## Verdict') },
  { name: 'banned-phrase', mutate: (root) =>
    append(root, 'skills/shaping/SKILL.md', "\nlet me know if you'd like me to continue\n") },
  { name: 'expanded-banned-language', mutate: (root) =>
    append(root, 'skills/shaping/SKILL.md', '\nUse WebSearch when useful.\n') },
  { name: 'broken-reference', mutate: (root) =>
    replaceText(root, 'skills/implementing-batch/SKILL.md', 'references/critique.md', 'references/missing.md') },
  { name: 'removed-required-owner-row', mutate: (root) =>
    dropLines(root, 'skills/debug/SKILL.md', '| `../implementing-batch/references/security.md` |') },
  { name: 'extra-ui-reference', mutate: (root) =>
    write(root, 'skills/designing/references/extra.md',
      '# Extra\n\nReject it. The enemy is excess. The overcorrection is omission.\n\n## Judgment\n\n- Stop.\n') },
  { name: 'dangling-script-link', mutate: (root) =>
    replaceText(root, 'skills/designing/references/visual-critique.md', 'scripts/check-ui.mjs', 'scripts/absent.mjs') },
  { name: 'noncanonical-skill-replacement', mutate: (root) => {
    const nested = path.join(root, 'skills/shaping/shaping');
    fs.mkdirSync(nested);
    fs.renameSync(path.join(root, 'skills/shaping/SKILL.md'), path.join(nested, 'SKILL.md'));
  } },
  { name: 'drifted-size-fact', mutate: (root) => replaceText(root, 'skills/implementing-batch/SKILL.md',
    'more than one source/test/config file must change', 'more than two source/test/config files must change') },
  { name: 'drifted-ledger-rule', mutate: (root) => replaceText(root, 'skills/implementing-batch/SKILL.md',
    'from the working tree diff before the next edit', 'from memory before the next edit') },
  { name: 'drifted-floor-number', mutate: (root) => replaceText(root, 'skills/designing/references/visual-direction.md',
    'verify a ratio of at least 4.5:1', 'verify a ratio of at least 4:1') },
  { name: 'handshake-desync', mutate: (root) => replaceText(root, 'skills/shaping/SKILL.md',
    'shaping decides those first; designing follows for presentation',
    'shaping decides these first; designing follows for presentation') },
  { name: 'oversized-description', mutate: (root) => replaceText(root, 'skills/research/SKILL.md',
    'description: Use when a code decision', `description: ${'overlong '.repeat(140)}Use when a code decision`) },
  { name: 'dropped-underdesign-contract', mutate: (root) => replaceText(root, 'skills/designing/SKILL.md',
    'A full or bounded redesign fails when the rendered result stays materially interchangeable with the baseline',
    'A redesign should feel fresh') },
  { name: 'dropped-bounded-redesign-trigger', mutate: (root) => replaceText(root, 'skills/designing/SKILL.md',
    '; or a report that an existing surface is empty, boring, generic, flat, unfinished, or not distinctive', '') },
  { name: 'drifted-audit-precedence', mutate: (root) => replaceText(root, 'skills/deepen/SKILL.md',
    'every other planning turn belongs to', 'planning turns belong to') },
  { name: 'effort-absent', expect: 'accept', mutate: (root) => {
    for (const skill of ['debug', 'deepen']) dropLines(root, `skills/${skill}/SKILL.md`, 'effort:');
  } },
  { name: 'effort-low', expect: 'accept', mutate: (root) =>
    replaceText(root, 'skills/debug/SKILL.md', 'name: debug', 'name: debug\neffort: low') },
  { name: 'effort-medium', expect: 'accept', mutate: (root) =>
    replaceText(root, 'skills/debug/SKILL.md', 'name: debug', 'name: debug\neffort: medium') },
  { name: 'effort-high', expect: 'accept', mutate: (root) =>
    replaceText(root, 'skills/debug/SKILL.md', 'name: debug', 'name: debug\neffort: high') },
  { name: 'effort-max', expect: 'accept', mutate: (root) =>
    replaceText(root, 'skills/debug/SKILL.md', 'name: debug', 'name: debug\neffort: max') },
  { name: 'effort-bogus', mutate: (root) =>
    replaceText(root, 'skills/debug/SKILL.md', 'name: debug', 'name: debug\neffort: bogus') },
  { name: 'model-bogus', mutate: (root) =>
    replaceText(root, 'skills/debug/SKILL.md', 'name: debug', 'name: debug\nmodel: bogus') },
  { name: 'effort-duplicate', mutate: (root) =>
    replaceText(root, 'skills/debug/SKILL.md', 'name: debug', 'name: debug\neffort: xhigh\neffort: high') },
  { name: 'effort-without-name', mutate: (root) =>
    dropLines(root, 'skills/debug/SKILL.md', 'name:') },
  { name: 'effort-without-description', mutate: (root) =>
    dropLines(root, 'skills/debug/SKILL.md', 'description:') },
  { name: 'effort-unknown-key', mutate: (root) =>
    replaceText(root, 'skills/debug/SKILL.md', 'name: debug', 'name: debug\nmodel-effort: high') },
  { name: 'skill-char-budget', mutate: (root) => {
    const lines = read(root, 'skills/designing/SKILL.md').split('\n');
    const last = lines.at(-1) === '' ? lines.length - 2 : lines.length - 1;
    lines[last] += ' padding'.repeat(400);
    write(root, 'skills/designing/SKILL.md', lines.join('\n'));
  } },
  { name: 'dropped-render-evidence', mutate: (root) => replaceText(root, 'skills/designing/SKILL.md',
    'baseline before the first edit, post-build before the critique fixes, and final after them',
    'capture the surface before and after building') },
  { name: 'dropped-evidence-sufficiency', mutate: (root) => replaceText(root, 'skills/designing/SKILL.md',
    'never substitute a product-category aesthetic for missing evidence',
    'pick a fitting product-category aesthetic') },
  { name: 'dropped-motion-evidence-contract', mutate: (root) => replaceText(root, 'skills/designing/references/motion.md',
    'only exercised is motion-verified', 'a careful read of the code is enough') },
  { name: 'dropped-direction-contract-gate', mutate: (root) => replaceText(root, 'skills/designing/SKILL.md',
    'validate the set with `--check` to status ok before building any variant',
    'render at least two variants and pick the better one') },
  { name: 'dropped-font-provenance', mutate: (root) => replaceText(root, 'skills/designing/references/typography.md',
    'Do not name a new typeface from memory.', 'Choose a face you know works.') },
  { name: 'dropped-quiet-region-jobs', mutate: (root) => replaceText(root, 'skills/designing/references/visual-direction.md',
    'Every planned quiet region carries one named job', 'Large quiet regions are fine as breathing room') },
  { name: 'broken-skill-script', mutate: (root) =>
    append(root, 'skills/designing/scripts/capture.mjs', '\nexport function broken( {\n') },
  { name: 'divergent-planning-data-migration', mutate: (root) =>
    append(root, 'skills/planning/references/data-migration.md', 'x') }
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
      const run = spawnSync(process.execPath, [verifier, '--repository-root', caseRoot, '--skip-link-check'], {
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

// No instruction file under skills/, agents/ or output-styles/ adds a list item
// of MAX_BULLET_SENTENCES or more sentences or a sentence over
// MAX_SENTENCE_WORDS words: past those a rule carries more than one condition
// and action, and the model follows it less. Offenders the allowlist names
// pass until split; tests/instruction-density.test.mjs fails an entry that no
// longer matches, so the list only shrinks. Sentences per skill print as a
// note, never a failure.

import {
  ALLOWLIST, MAX_BULLET_SENTENCES, MAX_SENTENCE_WORDS,
  applyAllowlist, densityFindings, readAllowlist, rulesPerSkill
} from '../instruction-density.mjs';

export function checkInstructionDensity(report, repository) {
  const entries = readAllowlist(repository.root);
  const { unlisted } = applyAllowlist(densityFindings(repository.root), entries);
  report.assert(
    unlisted.length === 0,
    'instruction density',
    `no list item past ${MAX_BULLET_SENTENCES - 1} sentences and no sentence past ${MAX_SENTENCE_WORDS} words outside the ${entries.length} entries of ${ALLOWLIST}`,
    `split each, never allowlist it: ${unlisted.map((finding) => `${finding.path}:${finding.line} ${finding.detail}`).join(', ')}`
  );
  report.note(
    'rules per skill',
    `sentences in SKILL.md plus references: ${rulesPerSkill(repository.root).map((entry) => `${entry.skill} ${entry.sentences}`).join(', ')}`
  );
}

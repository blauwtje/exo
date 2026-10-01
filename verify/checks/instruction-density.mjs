// No instruction file under skills/, agents/ or output-styles/ adds a list item
// of MAX_BULLET_SENTENCES or more sentences or a sentence over
// MAX_SENTENCE_WORDS words: past those a rule carries more than one condition
// and action, and the model follows it less. Offenders the allowlist names
// pass until split; tests/instruction-density.test.mjs fails an entry that no
// longer matches, and the check fails an allowlist longer than
// INSTRUCTION_DENSITY_ALLOWLIST_LOCK, so the list only shrinks. Sentences per
// skill print as a note, never a failure.

import {
  ALLOWLIST, MAX_BULLET_SENTENCES, MAX_SENTENCE_WORDS,
  applyAllowlist, densityFindings, readAllowlist, rulesPerSkill
} from '../instruction-density.mjs';
import { INSTRUCTION_DENSITY_ALLOWLIST_LOCK } from '../budgets.mjs';

export function checkInstructionDensity(report, repository) {
  const entries = readAllowlist(repository.root);
  const { unlisted } = applyAllowlist(densityFindings(repository.root), entries);
  const lock = INSTRUCTION_DENSITY_ALLOWLIST_LOCK.entries;
  const failures = [];
  if (entries.length > lock) failures.push(`${ALLOWLIST} holds ${entries.length} entries, over the ${lock} locked in verify/budgets.mjs; split the new offenders and delete their lines`);
  if (unlisted.length > 0) failures.push(`split each, never allowlist it: ${unlisted.map((finding) => `${finding.path}:${finding.line} ${finding.detail}`).join(', ')}`);
  report.assert(
    failures.length === 0,
    'instruction density',
    `no list item past ${MAX_BULLET_SENTENCES - 1} sentences and no sentence past ${MAX_SENTENCE_WORDS} words outside the ${entries.length} entries of ${ALLOWLIST}`,
    failures.join('; ')
  );
  report.note(
    'rules per skill',
    `sentences in SKILL.md plus references: ${rulesPerSkill(repository.root).map((entry) => `${entry.skill} ${entry.sentences}`).join(', ')}`
  );
}

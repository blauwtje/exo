import { MAX_BULLET_SENTENCES, MAX_SENTENCE_WORDS, densityFindings, rulesPerSkill } from '../instruction-density.mjs';

export function checkInstructionDensity(report, repository) {
  const findings = densityFindings(repository.root);
  report.assert(
    findings.length === 0,
    'instruction density',
    `no list item past ${MAX_BULLET_SENTENCES - 1} sentences and no sentence past ${MAX_SENTENCE_WORDS} words`,
    `split each: ${findings.map((finding) => `${finding.path}:${finding.line} ${finding.detail}`).join(', ')}`
  );
  report.note(
    'rules per skill',
    `sentences in SKILL.md plus references: ${rulesPerSkill(repository.root).map((entry) => `${entry.skill} ${entry.sentences}`).join(', ')}`
  );
}

import { userReadProblems, MAX_JARGON_PER_100_WORDS } from '../user-read.mjs';

export function checkUserReadFormat(report, repository) {
  const { count, errors } = userReadProblems(repository.root);
  report.assert(
    errors.length === 0,
    'user-read format',
    `${count} user-read format sources hold an answer line, the user's-language rule, no banned phrase and at most ${MAX_JARGON_PER_100_WORDS} jargon words per 100, no all-caps word and no machine-text line`,
    errors.join('; ')
  );
}

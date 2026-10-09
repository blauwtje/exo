// A delegate's report lands whole in the session that dispatched it, so every
// delegate prompt states the most lines its report may run to.

const RETURN_CAP = /\bat most (\d+|[a-z]+) lines\b/i;

// The lines a delegate's report may run to: the prompt's stated cap, or null
// when it states none in digits.
export function reportCap(promptText) {
  const cap = Number(RETURN_CAP.exec(promptText)?.[1]);
  return Number.isInteger(cap) ? cap : null;
}

export function checkReturnCaps(report, repository) {
  const uncapped = [...repository.promptFiles(), ...repository.agentFiles()]
    .filter((file) => !RETURN_CAP.test(repository.text(file)))
    .map((file) => repository.relative(file));
  report.assert(
    uncapped.length === 0,
    'delegate return caps',
    'every delegate prompt and agent caps its report in lines',
    `no 'at most <n> lines' cap in ${uncapped.join(', ')}`
  );
}

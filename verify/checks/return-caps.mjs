// A delegate's report lands whole in the session that dispatched it, so every
// delegate prompt states the most lines its report may run to.

const RETURN_CAP = /\bat most (\d+|[a-z]+) lines\b/i;

export function checkReturnCaps(report, repository) {
  const uncapped = repository.promptFiles()
    .filter((file) => !RETURN_CAP.test(repository.text(file)))
    .map((file) => repository.relative(file));
  report.assert(
    uncapped.length === 0,
    'delegate return caps',
    'every delegate prompt caps its report in lines',
    `no 'at most <n> lines' cap in ${uncapped.join(', ')}`
  );
}

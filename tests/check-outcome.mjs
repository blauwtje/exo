export function checkOutcome(check, repository) {
  const results = [];
  const report = { assert: (ok, name, details) => results.push({ ok, detail: ok ? details.pass : details.fail }) };
  check(report, repository);
  return results[0];
}

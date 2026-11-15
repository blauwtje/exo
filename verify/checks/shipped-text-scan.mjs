const PATTERNS = [
  ['credential', '\\bAKIA[0-9A-Z]{16}\\b', ''],
  ['credential', '\\bgh[pousr]_[A-Za-z0-9]{20,}', ''],
  ['credential', '\\bsk-ant-[A-Za-z0-9_-]{10,}', ''],
  ['credential', '-----BEGIN [A-Z ]*PRIVATE KEY-----', ''],
  ['override phrase', 'ignore (?:all )?(?:the )?(?:previous|prior|above) instructions', 'i'],
  ['override phrase', 'disregard (?:all )?(?:the )?(?:previous|prior|above)', 'i'],
];

function patternErrors(label, text) {
  return PATTERNS
    .filter(([, pattern, flags]) => new RegExp(pattern, flags).test(text))
    .map(([kind, pattern, flags]) => `${label}: ${kind} /${pattern}/${flags}`);
}

export function checkShippedTextScan(report, repository) {
  const errors = repository.shippedTextFiles().flatMap((file) => patternErrors(repository.relative(file), repository.text(file)));
  report.assert(
    errors.length === 0,
    'shipped text scan',
    { pass: 'no credential or override phrase appears in active skill text', fail: errors.join('; ') }
  );
}

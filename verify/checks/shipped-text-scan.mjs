const PATTERNS = [
  ['credential', '\\bAKIA[0-9A-Z]{16}\\b', ''],
  ['credential', '\\bgh[pousr]_[A-Za-z0-9]{20,}', ''],
  ['credential', '\\bsk-ant-[A-Za-z0-9_-]{10,}', ''],
  ['credential', '-----BEGIN [A-Z ]*PRIVATE KEY-----', ''],
  ['override phrase', 'ignore (?:all )?(?:the )?(?:previous|prior|above) instructions', 'i'],
  ['override phrase', 'disregard (?:all )?(?:the )?(?:previous|prior|above)', 'i'],
];

export function checkShippedTextScan(report, repository) {
  const files = new Set([...repository.processFiles(), ...repository.promptFiles(), ...repository.agentFiles(), ...repository.everySkillFile()]);
  const errors = [];
  for (const file of files) {
    const text = repository.text(file);
    for (const [kind, pattern, flags] of PATTERNS) {
      if (new RegExp(pattern, flags).test(text)) {
        errors.push(`${repository.relative(file)}: ${kind} /${pattern}/${flags}`);
      }
    }
  }
  report.assert(
    errors.length === 0,
    'shipped text scan',
    'no credential or override phrase appears in active skill text',
    errors.join('; ')
  );
}

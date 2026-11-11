const NEXT_BY_PREFIX = [
  [/^(?:WARN|FIX-ONLY|SELF-HOSTED|DOCS)\b/, 'NEXT put this line in the report; it ends no turn'],
  [/^SKIP\b/, 'NEXT accept the cached pass; do not rerun it'],
  [/^FLAKY\b/, 'NEXT list the file in the report; it ends no turn'],
  [/^SESSION\b/, 'NEXT call the named mcp tool with its args, record PASS or FAIL, or UNRUN when no such tool exists'],
  [/^DISPATCH\b/, 'NEXT add 3-5 questions from Goal and each task Data, Risk and Acceptance; dispatch exo:review-branch per line, one message']
];

export function nextLines(body) {
  return NEXT_BY_PREFIX.flatMap(([pattern, text]) => (body.some((line) => pattern.test(line)) ? [text] : []));
}

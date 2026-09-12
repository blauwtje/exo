// No vendor, harness, or model name and no assistant filler reaches a skill
// body, so the corpus stays portable and does not age with a product. The
// pattern text is quoted back in the failure detail.

const CASE_INSENSITIVE = [
  "let me know if you(?:'|’)d like",
  'would you like me to',
  'shall I proceed',
  'before I proceed',
  'do you want me to',
  'when appropriate',
  'when needed',
  'when useful',
  'as appropriate',
  'where appropriate',
  'if helpful',
  'where needed',
  'as needed',
  'if necessary',
  '\\bsubagents?\\b',
];

const CASE_SENSITIVE = [
  '\\bClaude Code\\b',
  '\\bCodex\\b',
  // A plan task heading reads `Task 3` or `Task <n>`; the tool name never takes a number.
  '\\bTask\\b(?!\\s*(?:\\d|<|\\[))',
  '\\bAgent\\b',
  '\\bWebSearch\\b',
  '\\bWebFetch\\b',
  '\\bTodoWrite\\b',
  '\\bMultiEdit\\b',
  '\\bAskUserQuestion\\b',
  '\\bEnterPlanMode\\b',
  '\\bExitPlanMode\\b',
  '\\$(?:explorer|reviewer|implementer|planner|worker)\\b',
  '\\bmcp__[A-Za-z0-9_]+\\b',
];

export function checkBannedText(report, repository) {
  const errors = [];
  for (const file of [...repository.processFiles(), ...repository.promptFiles()]) {
    const relative = repository.relative(file);
    const content = repository.text(file);
    for (const pattern of CASE_INSENSITIVE) {
      if (new RegExp(pattern, 'i').test(content)) {
        errors.push(`${relative}: banned text /${pattern}/i`);
      }
    }
    for (const pattern of CASE_SENSITIVE) {
      if (new RegExp(pattern).test(content)) {
        errors.push(`${relative}: vendor capability /${pattern}/`);
      }
    }
  }
  report.assert(
    errors.length === 0,
    'portable language',
    'no banned phrase or vendor capability appears in active skill text',
    errors.join('; ')
  );
}

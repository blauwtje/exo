import fs from 'node:fs';

const REFERENCE = 'fix-class.md';

const REPAIR_TEXTS = [
  { file: 'agents/fix-review.md' },
  { file: 'skills/build/review-fixer-prompt.md' },
  { file: 'skills/find-cause/fixer-prompt.md', from: '## Shared block' },
  { file: 'agents/build-task.md' }
];

function loadedText(repository, { file, from }) {
  const path = repository.join(file);
  if (!fs.existsSync(path)) return '';
  const text = repository.text(path);
  return from ? text.slice(Math.max(text.indexOf(from), 0)) : text;
}

export function checkFixClassLoad(report, repository) {
  const missing = REPAIR_TEXTS.filter((entry) => !loadedText(repository, entry).includes(REFERENCE));
  if (!missing.length) {
    report.result('PASS', 'fix-class load', `every repair text names ${REFERENCE}`);
    return;
  }
  for (const { file, from } of missing) {
    report.result('FAIL', 'fix-class load', `${file}${from ? ` (${from})` : ''} does not name ${REFERENCE}`);
  }
}

import fs from 'node:fs';
import { CODE_EXTENSIONS, commentSpans } from '#code-comments';

const SCOPE = /^(skills|lib|hooks)\//;

function isCodeFile(relativePath) {
  const dot = relativePath.lastIndexOf('.');
  return SCOPE.test(relativePath) && dot > 0 && relativePath.slice(dot).toLowerCase() in CODE_EXTENSIONS;
}

export function checkCodeComments(report, repository) {
  const files = repository.trackedFiles().filter((file) => isCodeFile(repository.relative(file)));
  let failures = 0;
  for (const file of files) {
    const relativePath = repository.relative(file);
    const spans = commentSpans(file, fs.readFileSync(file, 'utf8'));
    for (const span of spans.filter((entry) => !entry.allowed || entry.doc)) {
      failures += 1;
      report.result('FAIL', 'code comments', `${relativePath}:${span.start} holds a comment the code standard does not allow`);
    }
  }
  if (failures === 0) report.result('PASS', 'code comments', `${files.length} code files in skills/, lib/ and hooks/ hold no disallowed comment`);
}

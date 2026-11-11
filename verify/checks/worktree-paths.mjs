const OWNER = 'lib/checkout.mjs';
const SCRIPT_ROOTS = ['skills', 'lib', 'hooks', 'agents', 'harnesses'];
const WORKTREE_ADD = /git\s+worktree\s+add|\[\s*'worktree'\s*,\s*'add'|"worktree"\s*,\s*"add"/;
const GUARD_DENY_TEXT = { file: 'lib/guard-rules.mjs', line: /worktree under `\.claude\/worktrees\/<name>`/ };
const FOLDER_LITERAL = /\.claude[\\/]worktrees|\.worktrees\b|'\.claude'\s*,\s*'worktrees'/;

function lineFindings(repository, file) {
  const relative = repository.relative(file);
  const findings = [];
  repository.text(file).split('\n').forEach((line, index) => {
    if (WORKTREE_ADD.test(line)) findings.push(`${relative}:${index + 1}: git worktree add outside ${OWNER}`);
    const exempt = relative === GUARD_DENY_TEXT.file && GUARD_DENY_TEXT.line.test(line);
    if (!exempt && FOLDER_LITERAL.test(line)) findings.push(`${relative}:${index + 1}: worktree folder literal outside ${OWNER}`);
  });
  return findings;
}

const PATH_CALL = /\bworktreePath\(([^()]*(?:\([^()]*\)[^()]*)*)\)/g;

function directoryFindings(repository, file) {
  if (!file.endsWith('.mjs')) return [];
  const relative = repository.relative(file);
  return [...repository.text(file).matchAll(PATH_CALL)]
    .filter((call) => !call[1].includes(','))
    .map((call) => `${relative}: worktreePath(${call[1]}) names no directory`);
}

function scannedFiles(repository) {
  const scripts = repository.trackedFiles().filter((file) => {
    const relative = repository.relative(file);
    return file.endsWith('.mjs') && SCRIPT_ROOTS.some((root) => relative.startsWith(`${root}/`));
  });
  const prose = [...repository.processFiles(), ...repository.promptFiles(), ...repository.agentFiles(), ...repository.everySkillFile()];
  return new Set([...scripts, ...prose]);
}

export function checkWorktreePaths(report, repository) {
  const findings = [];
  for (const file of scannedFiles(repository)) {
    findings.push(...directoryFindings(repository, file));
    if (repository.relative(file) === OWNER) continue;
    findings.push(...lineFindings(repository, file));
  }
  report.assert(
    findings.length === 0,
    'worktree paths',
    `git worktree add and worktree folder paths live only in ${OWNER}`,
    findings.join('; ')
  );
}

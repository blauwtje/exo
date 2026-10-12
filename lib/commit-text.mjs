const SHARED_ATTRIBUTION_PHRASES = 'co-authored-by|generated\\s+with|generated\\s+by|noreply@anthropic\\.com|robot_face';
const PRODUCT_CREDIT = '\\b(?:made|written|built|created|authored|assisted|produced|generated)\\s+(?:with|by|using|via|in)\\s+\\[?claude\\s+code|claude\\.com/claude-code';
const ATTRIBUTION = new RegExp(`${SHARED_ATTRIBUTION_PHRASES}|${PRODUCT_CREDIT}`, 'i');
const BRANCH_ATTRIBUTION_PHRASES = `${SHARED_ATTRIBUTION_PHRASES}|claude\\s+code`.replaceAll('\\s+', '[-_/]');
const ATTRIBUTED_BRANCH = new RegExp(`^(?:(?:claude|codex|copilot)/|.*(?:${BRANCH_ATTRIBUTION_PHRASES}))`, 'i');

export const COMMIT_TYPES = ['build', 'chore', 'ci', 'docs', 'feat', 'fix', 'merge', 'perf', 'refactor', 'revert', 'style', 'test'];
const CONVENTIONAL_SUBJECT = new RegExp(`^(${COMMIT_TYPES.join('|')})(\\([^()]+\\))?!?: [^ ]`);

export function attributionProblem(text) {
  if (!ATTRIBUTION.test(text)) return null;
  return 'commit and pull-request text must not attribute the work to an AI. Remove the Co-Authored-By trailer, the "Generated with" line and every tool name.';
}

export function subjectProblem(subject) {
  if (CONVENTIONAL_SUBJECT.test(subject)) return null;
  return `a subject follows Conventional Commits so the log can be read by type: type(scope): subject, such as feat(hooks): add the commit check. The scope is optional and the type is one of ${COMMIT_TYPES.join(', ')}.`;
}

export function branchNameProblem(name) {
  if (!ATTRIBUTED_BRANCH.test(name)) return null;
  return 'a branch name must not name an AI, because it shows in every pull request made from it. Drop a leading claude/, codex/ or copilot/ and every attribution phrase.';
}

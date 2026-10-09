// What commit and pull-request text may say. A commit, a pull request and a branch
// outlive the session and then read as a fact about who wrote the code, and a
// subject without a type hides what the change is from a reader of the log.
// Each check returns the problem as one sentence, or null when the text passes.
// Ceiling: a bare "Claude" is not matched, because `chore(claude):` is an
// established scope, nor a bare "Claude Code" in text, because exo's own commits
// name the product as their subject; only attribution-shaped phrases are, and a
// tool name only as the first segment of a branch name.

// The phrases that attribute wherever they land. Text adds the product name only
// behind a verb of authorship or as its link, while a branch name refuses the name
// itself, since no branch has it as a subject. A branch name holds no space, so
// there the whitespace of a phrase stands for the separators a name uses instead.
const SHARED_ATTRIBUTION_PHRASES = 'co-authored-by|generated\\s+with|generated\\s+by|noreply@anthropic\\.com|robot_face';
const PRODUCT_CREDIT = '\\b(?:made|written|built|created|authored|assisted|produced|generated)\\s+(?:with|by|using|via|in)\\s+\\[?claude\\s+code|claude\\.com/claude-code';
const ATTRIBUTION = new RegExp(`${SHARED_ATTRIBUTION_PHRASES}|${PRODUCT_CREDIT}`, 'i');
const BRANCH_ATTRIBUTION_PHRASES = `${SHARED_ATTRIBUTION_PHRASES}|claude\\s+code`.replaceAll('\\s+', '[-_/]');
const ATTRIBUTED_BRANCH = new RegExp(`^(?:(?:claude|codex|copilot)/|.*(?:${BRANCH_ATTRIBUTION_PHRASES}))`, 'i');

export const COMMIT_TYPES = ['build', 'chore', 'ci', 'docs', 'feat', 'fix', 'merge', 'perf', 'refactor', 'revert', 'style', 'test'];
const CONVENTIONAL_SUBJECT = new RegExp(`^(${COMMIT_TYPES.join('|')})(\\([^()]+\\))?!?: [^ ]`);

/** The problem with attributing `text` (a message, trailers, a title or a body) to an AI, or null. */
export function attributionProblem(text) {
  if (!ATTRIBUTION.test(text)) return null;
  return 'commit and pull-request text must not attribute the work to an AI. Remove the Co-Authored-By trailer, the "Generated with" line and every tool name.';
}

/** The problem with a commit or pull-request subject that is not a Conventional Commit, or null. */
export function subjectProblem(subject) {
  if (CONVENTIONAL_SUBJECT.test(subject)) return null;
  return `a subject follows Conventional Commits so the log can be read by type: type(scope): subject, such as feat(hooks): add the commit check. The scope is optional and the type is one of ${COMMIT_TYPES.join(', ')}.`;
}

/** The problem with a branch name that names an AI, or null. */
export function branchNameProblem(name) {
  if (!ATTRIBUTED_BRANCH.test(name)) return null;
  return 'a branch name must not name an AI, because it shows in every pull request made from it. Drop a leading claude/, codex/ or copilot/ and every attribution phrase.';
}

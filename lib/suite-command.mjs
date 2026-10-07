// Whether a shell command runs a project's whole test suite, for plan-check.
// Imported as `#suite-command`.

// `check` matches at a word start and not as `checkout`, so `git checkout` stays out.
const TEST_LIKE = /test|e2e|\bcheck(?!out)|lint|verify/;
// Launchers skipped to reach the program a segment runs: `npm run check` runs `check`.
const LAUNCHERS = new Set(['npx', 'pnpm', 'yarn', 'npm', 'bun', 'bunx', 'make', 'uv', 'poetry', 'python', 'python3', 'run', 'exec', '-m']);
// Programs whose result depends on remote state (CI, a server, a registry), not on the code.
const REMOTE_PROGRAMS = new Set(['gh', 'curl', 'wget', 'http', 'https', 'ssh', 'scp', 'kubectl', 'helm', 'aws', 'gcloud', 'az', 'docker', 'nc', 'ping', 'git']);
// Words that join a launcher to its script and so leave the whole-suite key: `npm run test` is `npm test`.
const KEY_FILLER = new Set(['run', 'exec', '-m']);
// A redirection and its target: `> file`, `>> file`, `2>&1`, `&> file`.
const REDIRECTION = /&?\d*>>?&?\s*\S+/g;
const ENV_ASSIGNMENT = /^\w+=/;
// A script or subcommand name, not a path, URL or option.
const BARE_NAME = /^[\w:.-]+$/;
// A mode that never finishes, a command that is not a test run, and a wait loop or sleep.
const NOT_A_SUITE = /--watch|--ui|--headed| dev| serve| start|install|deploy|\bbuild|\b(until|while|sleep)\b/;

// The program a shell segment runs and its first argument, past env
// assignments and launchers: `CI=1 npx eslint .` gives ['eslint', '.'].
function leadingWords(segment) {
  const words = segment.trim().split(/\s+/);
  let index = 0;
  while (index < words.length && ENV_ASSIGNMENT.test(words[index])) index += 1;
  while (index < words.length - 1 && LAUNCHERS.has(words[index])) index += 1;
  return words.slice(index, index + 2);
}

// True for a test-like command: a segment whose program or script name is
// test-like, no segment that reads remote state, and not a watch, UI or dev
// mode, an install, deploy or build, or a wait loop or sleep.
function isTestLike(command) {
  if (NOT_A_SUITE.test(command)) return false;
  const segments = command.split(/\|\|?|&&|;/).map(leadingWords);
  if (segments.some(([program]) => REMOTE_PROGRAMS.has(program))) return false;
  return segments.some((words) => words.some((word) => BARE_NAME.test(word) && TEST_LIKE.test(word)));
}

// The key of a segment that runs the whole suite, else null: a test-like segment
// that, past env assignments, launchers and its test-like word, carries only
// options and launcher words. The key is its words without env assignments,
// options and `run`-style fillers, so `npm test`, `npm run test` and
// `npm test > log` share the key `npm test`.
function wholeSuiteKey(segment) {
  const text = segment.replace(REDIRECTION, ' ');
  if (!isTestLike(text)) return null;
  const words = text.trim().split(/\s+/).filter((word) => !ENV_ASSIGNMENT.test(word));
  let start = 0;
  while (start < words.length - 1 && LAUNCHERS.has(words[start])) start += 1;
  const testIndex = words.findIndex((word, index) => index >= start && index < start + 2 && BARE_NAME.test(word) && TEST_LIKE.test(word));
  if (testIndex === -1) return null;
  const narrowing = words.slice(testIndex + 1).some((word) => !word.startsWith('-') && !LAUNCHERS.has(word));
  if (narrowing) return null;
  return words.filter((word) => !word.startsWith('-') && !KEY_FILLER.has(word)).join(' ');
}

// The keys of the segments of `command` that run the whole suite, in order.
export function wholeSuiteKeys(command) {
  return command.split(/\|\|?|&&|;/).map(wholeSuiteKey).filter((key) => key !== null);
}

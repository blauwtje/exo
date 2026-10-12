const TEST_LIKE = /test|e2e|\bcheck(?!out)|lint|verify/;
const LAUNCHERS = new Set(['npx', 'pnpm', 'yarn', 'npm', 'bun', 'bunx', 'make', 'uv', 'poetry', 'python', 'python3', 'run', 'exec', '-m']);
const REMOTE_PROGRAMS = new Set(['gh', 'curl', 'wget', 'http', 'https', 'ssh', 'scp', 'kubectl', 'helm', 'aws', 'gcloud', 'az', 'docker', 'nc', 'ping', 'git']);
const KEY_FILLER = new Set(['run', 'exec', '-m']);
const REDIRECTION = /&?\d*>>?&?\s*\S+/g;
const ENV_ASSIGNMENT = /^\w+=/;
const BARE_NAME = /^[\w:.-]+$/;
const NOT_A_SUITE = /--watch|--ui|--headed| dev| serve| start|install|deploy|\bbuild|\b(until|while|sleep)\b/;

function leadingWords(segment) {
  const words = segment.trim().split(/\s+/);
  let index = 0;
  while (index < words.length && ENV_ASSIGNMENT.test(words[index])) index += 1;
  while (index < words.length - 1 && LAUNCHERS.has(words[index])) index += 1;
  return words.slice(index, index + 2);
}

function isTestLike(command) {
  if (NOT_A_SUITE.test(command)) return false;
  const segments = command.split(/\|\|?|&&|;/).map(leadingWords);
  if (segments.some(([program]) => REMOTE_PROGRAMS.has(program))) return false;
  return segments.some((words) => words.some((word) => BARE_NAME.test(word) && TEST_LIKE.test(word)));
}

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

export function wholeSuiteKeys(command) {
  return command.split(/\|\|?|&&|;/).map(wholeSuiteKey).filter((key) => key !== null);
}

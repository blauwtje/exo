export const SHARED_STATE_GIT = [
  'stash *',
  'worktree remove *', 'worktree prune*', 'worktree move *',
  'branch -d *', 'branch -D *', 'branch -m *', 'branch -M *', 'branch --delete *', 'branch --move *'
];

export const sharedStateDenyRules = () => SHARED_STATE_GIT.map((pattern) => `Bash(git ${pattern})`);

const SEPARATORS = new Set([';', '&', '|', '\n', '(', ')', '`', '{', '}']);
const REDIRECTS = new Set(['<', '>']);
const REDIRECT_TAIL = new Set(['<', '>', '&', '|']);
const SHELLS = new Set(['sh', 'bash', 'zsh']);
const COMMAND_CLUSTER = /^-[^-]*c/;
const GIT_VALUE_OPTIONS = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--exec-path', '--super-prefix', '--config-env']);
const BRANCH_VALUE_OPTIONS = new Set(['--sort', '--format', '--contains', '--no-contains', '--merged', '--no-merged', '--points-at', '--set-upstream-to', '-u']);
const BRANCH_VALUE_SHORT = 'u';
const LONG_ABBREVIATION_MINIMUM = { '--delete': 3, '--move': 4 };

function newTokenizer() {
  return { segments: [], tokens: [], word: '', inWord: false, quote: null, skipWord: false };
}

function append(state, character) {
  state.word += character;
  state.inWord = true;
}

function endWord(state) {
  if (state.inWord && state.skipWord) state.skipWord = false;
  else if (state.inWord) state.tokens.push(state.word);
  state.word = '';
  state.inWord = false;
}

function endSegment(state) {
  endWord(state);
  if (state.tokens.length > 0) state.segments.push(state.tokens);
  state.tokens = [];
  state.skipWord = false;
}

function readRedirect(state, command, index) {
  if (/^\d+$/.test(state.word)) state.inWord = false;
  endWord(state);
  state.skipWord = true;
  let end = index;
  while (REDIRECT_TAIL.has(command[end + 1])) end += 1;
  return end;
}

function readQuoted(state, character) {
  if (character === state.quote) state.quote = null;
  else append(state, character);
}

function readUnquoted(state, character) {
  if (character === "'" || character === '"') {
    state.quote = character;
    state.inWord = true;
    return;
  }
  if (SEPARATORS.has(character)) return endSegment(state);
  if (/\s/.test(character)) return endWord(state);
  append(state, character);
}

function readCharacter(state, command, index) {
  const character = command[index];
  if (state.quote === "'") {
    readQuoted(state, character);
    return index;
  }
  if (character === '\\') {
    if (index + 1 < command.length) append(state, command[index + 1]);
    return index + 1;
  }
  if (state.quote) readQuoted(state, character);
  else if (REDIRECTS.has(character)) return readRedirect(state, command, index);
  else readUnquoted(state, character);
  return index;
}

function tokenize(command) {
  const state = newTokenizer();
  for (let index = 0; index < command.length; index += 1) {
    index = readCharacter(state, command, index);
  }
  endSegment(state);
  return state.segments;
}

function subcommandIndex(argv, start) {
  let index = start + 1;
  while (index < argv.length && argv[index].startsWith('-')) {
    index += GIT_VALUE_OPTIONS.has(argv[index]) ? 2 : 1;
  }
  return index;
}

function deniedRules() {
  const rules = new Map();
  for (const pattern of SHARED_STATE_GIT) {
    const [subcommand, ...words] = pattern.replace(/\*$/, '').trim().split(/\s+/);
    const rule = rules.get(subcommand) ?? { whole: false, actions: new Set(), flags: new Set() };
    if (words.length === 0) rule.whole = true;
    for (const word of words) (word.startsWith('-') ? rule.flags : rule.actions).add(word);
    rules.set(subcommand, rule);
  }
  return rules;
}

const DENIED_RULES = deniedRules();

function isDeniedLongFlag(token, flags) {
  const name = token.split('=')[0];
  return [...flags].some((flag) => flag.startsWith('--') && name.length >= (LONG_ABBREVIATION_MINIMUM[flag] ?? flag.length) && flag.startsWith(name));
}

function isDeniedShortCluster(token, flags) {
  for (const letter of token.slice(1)) {
    if (letter === BRANCH_VALUE_SHORT) return false;
    if (flags.has(`-${letter}`)) return true;
  }
  return false;
}

function branchDeletesOrMoves(argv, from, flags) {
  for (let index = from; index < argv.length; index += 1) {
    const token = argv[index];
    if (BRANCH_VALUE_OPTIONS.has(token)) {
      index += 1;
      continue;
    }
    if (token.startsWith('--') && isDeniedLongFlag(token, flags)) return true;
    if (/^-[^-]/.test(token) && isDeniedShortCluster(token, flags)) return true;
  }
  return false;
}

function worktreeAction(argv, from) {
  for (let index = from; index < argv.length; index += 1) {
    if (!argv[index].startsWith('-')) return argv[index];
  }
  return undefined;
}

function subcommandDenied(argv, index) {
  const rule = DENIED_RULES.get(argv[index]);
  if (!rule) return false;
  if (rule.whole) return true;
  if (rule.actions.size > 0 && rule.actions.has(worktreeAction(argv, index + 1))) return true;
  return rule.flags.size > 0 && branchDeletesOrMoves(argv, index + 1, rule.flags);
}

function isGit(token) {
  return token === 'git' || token.endsWith('/git');
}

function isShell(token) {
  return SHELLS.has(token.split('/').pop());
}

function resumeIndex(argv, index) {
  const rule = DENIED_RULES.get(argv[index]);
  return rule?.flags.size > 0 ? argv.length : index;
}

function gitInvocationDenied(argv) {
  let index = 0;
  while (index < argv.length) {
    if (!isGit(argv[index])) {
      index += 1;
      continue;
    }
    const subcommand = subcommandIndex(argv, index);
    if (subcommandDenied(argv, subcommand)) return true;
    index = Math.max(resumeIndex(argv, subcommand), index + 1);
  }
  return false;
}

function shellScripts(argv) {
  const scripts = [];
  let waiting = false;
  for (let index = 0; index < argv.length; index += 1) {
    if (waiting && COMMAND_CLUSTER.test(argv[index]) && index + 1 < argv.length) {
      scripts.push(argv[index + 1]);
      waiting = false;
    }
    if (isShell(argv[index])) waiting = true;
    if (argv[index] === 'eval' && index + 1 < argv.length) scripts.push(argv.slice(index + 1).join(' '));
  }
  return scripts;
}

function segmentSharesGitState(argv) {
  return gitInvocationDenied(argv) || shellScripts(argv).some(sharesGitState);
}

export function sharesGitState(command) {
  return tokenize(command).some(segmentSharesGitState);
}

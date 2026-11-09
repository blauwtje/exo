import { fileURLToPath } from 'node:url';

const SEARCH_SCRIPT = fileURLToPath(new URL('../skills/spec/scripts/search.mjs', import.meta.url));
const MIRROR_HOST = /(^|\.)(reddit\.com|redd\.it|redlib[\w.-]*|libreddit[\w.-]*|teddit[\w.-]*|redditmirror[\w.-]*|arctic-shift[\w.-]*)\.?$/i;
const REDDIT_TARGET = /reddit\.com|redd\.it|arctic-shift/i;

export function redditRoute() {
  return `exo: Reddit blocks this call. Do instead: run node ${SEARCH_SCRIPT} --source reddit --query <text> --run <run-dir>; for a thread run search.mjs --url <thread-url>`;
}

function hostOf(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

export function redditRouteDecision({ tool_name: tool, tool_input: input } = {}) {
  if (tool !== 'WebFetch') return null;
  if (!MIRROR_HOST.test(hostOf(input?.url))) return null;
  return { deny: redditRoute() };
}

const HEREDOC_BODY = /<<-?\s*(['"]?)(\w+)\1[^\n]*\n[\s\S]*?\n\s*\2(?=\n|$)/g;
const FETCHERS = new Set(['curl', 'wget', 'fetch']);
const READ_ONLY_WORDS = new Set(['grep', 'rg', 'git', 'cat', 'sed', 'echo', 'printf']);
const WRAPPER_VALUE_FLAGS = {
  sudo: new Set(['-u', '-g', '-C', '-h', '-p', '-r', '-t', '-U', '-D', '-R']),
  env: new Set(['-u', '-C', '-S']),
  timeout: new Set(['-s', '-k', '--signal', '--kill-after']),
  nice: new Set(['-n', '--adjustment']),
  xargs: new Set(['-I', '-n', '-L', '-P', '-s', '-d', '-E', '-a', '-l', '-i']),
  nohup: new Set(),
  time: new Set(),
  command: new Set(),
  exec: new Set(['-a']),
};
const RESERVED = new Set(['{', '}', '!', 'if', 'then', 'else', 'elif', 'do', 'while', 'until']);
const SHELLS = new Set(['bash', 'sh', 'zsh', 'dash']);
const INLINE_RUNTIMES = new Set(['node', 'deno', 'bun']);
const EVAL_FLAG = /^(-[a-z]*[ep][a-z]*|--eval|--print)(=|$)/;
const ASSIGNMENT = /^[A-Za-z_]\w*=/;
const FETCH_CALL = /\bfetch\s*\(/;

function tokenize(command) {
  const commands = [[]];
  let word = null;
  let quote = '';
  const endWord = () => {
    if (word !== null) commands.at(-1).push(word);
    word = null;
  };
  const endCommand = () => {
    endWord();
    if (commands.at(-1).length) commands.push([]);
  };
  for (let i = 0; i < command.length; i++) {
    const char = command[i];
    if (quote) {
      if (char === quote) quote = '';
      else if (char === '\\' && quote === '"' && i + 1 < command.length) word += command[++i];
      else word += char;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      word ??= '';
    } else if (char === '\\' && i + 1 < command.length) word = (word ?? '') + command[++i];
    else if (/\s/.test(char) && char !== '\n') endWord();
    else if (';&|\n()`'.includes(char)) endCommand();
    else word = (word ?? '') + char;
  }
  endWord();
  return commands.filter((words) => words.length);
}

const baseName = (word) => word.split('/').pop();

function afterWrapperOptions(name, words) {
  const valueFlags = WRAPPER_VALUE_FLAGS[name];
  let rest = words;
  while (rest.length && rest[0].startsWith('-')) rest = rest.slice(valueFlags.has(rest[0]) ? 2 : 1);
  return name === 'timeout' && /^\d/.test(rest[0] ?? '') ? rest.slice(1) : rest;
}

function stripWrappers(words) {
  let rest = words;
  while (rest.length) {
    const name = baseName(rest[0]);
    if (ASSIGNMENT.test(rest[0]) || RESERVED.has(rest[0])) rest = rest.slice(1);
    else if (name in WRAPPER_VALUE_FLAGS) rest = afterWrapperOptions(name, rest.slice(1));
    else return rest;
  }
  return rest;
}

function shellScript(words) {
  const flag = words.findIndex((word, i) => i > 0 && /^-[a-z]*c[a-z]*$/.test(word));
  return flag < 0 ? null : (words[flag + 1] ?? null);
}

function inlineCode(words) {
  const flag = words.findIndex((word, i) => EVAL_FLAG.test(word) || (i === 0 && word === 'eval'));
  return flag < 0 ? '' : words.slice(flag).join(' ');
}

function withoutRedirects(words) {
  return words.filter((word, i) => !word.startsWith('<') && words[i - 1] !== '<<<');
}

function isBareShell(words) {
  const [first, ...tail] = stripWrappers(words);
  if (first === undefined || !SHELLS.has(baseName(first))) return false;
  return shellScript([first, ...tail]) === null && withoutRedirects(tail).every((word) => word.startsWith('-'));
}

function fetchesIn(words) {
  const [first, ...tail] = stripWrappers(words);
  if (first === undefined) return false;
  const head = baseName(first);
  if (READ_ONLY_WORDS.has(head)) return false;
  if (FETCHERS.has(head)) return true;
  if (SHELLS.has(head)) {
    const script = shellScript([first, ...tail]);
    return script !== null && commandsFetch(script);
  }
  if (INLINE_RUNTIMES.has(head)) return FETCH_CALL.test(inlineCode(tail));
  return false;
}

function commandsFetch(command) {
  const bodies = [...command.matchAll(HEREDOC_BODY)].map((match) => match[0].split('\n').slice(1, -1).join('\n'));
  const commands = tokenize(command.replace(HEREDOC_BODY, ''));
  if (commands.some(fetchesIn)) return true;
  if (!commands.some(isBareShell)) return false;
  const scripts = [...bodies, ...commands.flat().filter((word) => /\s/.test(word))];
  return scripts.some(commandsFetch);
}

export function redditBashDecision(command) {
  if (typeof command !== 'string') return null;
  const joined = command.replace(/\\\r?\n/g, ' ');
  if (!REDDIT_TARGET.test(joined) || !commandsFetch(joined)) return null;
  return { deny: redditRoute() };
}

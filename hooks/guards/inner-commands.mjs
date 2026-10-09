// Lists the string argument of each `bash`, `sh` or `zsh -c` (also `-lc`, a
// path) and `eval` in a command, quotes and escapes resolved, so a guard judges
// `bash -c "git reset --hard"` like the bare command. Calls are found in the
// blanked text. Ceiling: only a call at a command start counts (`sudo bash -c`,
// `xargs sh -c` pass); `eval` reads its first argument only.

import { blankCommandText } from './command-text.mjs';

const CALL = /(?:^|[;&|(\n])[ \t]*(?:(?:\S*\/)?(?:bash|sh|zsh)(?:[ \t]+-[-\w]+)*?[ \t]+-[a-zA-Z]*c[a-zA-Z]*|eval)[ \t]+/g;

// The argument of a double-quoted string starting after the quote at `start`,
// with `\"`, `\\`, `\$` and a backtick escape resolved.
function doubleQuoted(text, start) {
  let value = '';
  let index = start;
  while (index < text.length && text[index] !== '"') {
    const escaped = text[index] === '\\' && '"\\$`'.includes(text[index + 1] ?? '');
    if (escaped) index += 1;
    value += text[index];
    index += 1;
  }
  return value;
}

// The one shell word at `start` in `text`: single-quoted, double-quoted or bare.
function wordAt(text, start) {
  const quote = text[start];
  if (quote === "'") {
    const end = text.indexOf("'", start + 1);
    return text.slice(start + 1, end === -1 ? text.length : end);
  }
  if (quote === '"') return doubleQuoted(text, start + 1);
  const bare = /^[^\s;&|()<>]+/.exec(text.slice(start));
  return bare === null ? '' : bare[0];
}

export function innerCommands(command) {
  const blanked = blankCommandText(command);
  const inner = [];
  for (const call of blanked.matchAll(CALL)) {
    const word = wordAt(command, call.index + call[0].length);
    if (word.trim() !== '') inner.push(word);
  }
  return inner;
}

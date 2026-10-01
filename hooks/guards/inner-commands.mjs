// Lists the commands a shell runs from a string argument, so a guard can judge
// `bash -c "git reset --hard"` and `eval "git reset --hard"` as it judges the
// bare command. `innerCommands(command)` returns the string argument of each
// `bash`, `sh` or `zsh` run with `-c` (also `-lc`, a path such as `/bin/bash`)
// and of each `eval`, read from the raw text, quotes and escapes resolved. A
// call is found in the blanked text, so a commit message that merely names
// `bash -c` is not one.
// Ceiling: only a call at the start of a command, or after `;`, `&`, `|`, `(` or
// a newline, counts, so `sudo bash -c`, `env X=1 bash -c` and `xargs sh -c` pass;
// `eval` reads its first argument only; a `'\''` inside a single-quoted argument
// ends it; an argument built from variables reads as written. Lift the first by
// widening CALL.

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

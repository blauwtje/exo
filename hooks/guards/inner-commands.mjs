import { blankCommandText } from './command-text.mjs';

const CALL = /(?:^|[;&|(\n])[ \t]*(?:(?:\S*\/)?(?:bash|sh|zsh)(?:[ \t]+-[-\w]+)*?[ \t]+-[a-zA-Z]*c[a-zA-Z]*|eval)[ \t]+/g;

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

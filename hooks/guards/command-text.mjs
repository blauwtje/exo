// Blanks the text of a shell command that runs nothing (quoted text, heredoc
// bodies, the bare word after git `-m`) to spaces, keeping every position, so a
// guard matches the words that run. A substitution in double quotes or an
// unquoted heredoc runs, so it is kept. Ceiling: a command built from variables
// reads as written; a quote inside `$((...))` reads as a quote.

// A heredoc operator and its delimiter, shared with destructive-guard.
export const HEREDOC_OPERATOR = /<<(-?)[ \t]*(?:'([A-Za-z_]\w*)'|"([A-Za-z_]\w*)"|\\?([A-Za-z_]\w*))/y;

// Regex source for `git` (optional `.exe` and closing quote) and its global
// options in any order, up to the subcommand; `-C`, `-c`, `--git-dir`,
// `--work-tree` and `--namespace` take a value. Whitespace includes a
// `\`-newline. Ceiling: a quoted `"git"` counts only at the start of a command.
const SPACE = '(?:[ \\t]|\\\\\\n)';
const OPTION = `(?:(?:-[cC]|--(?:git-dir|work-tree|namespace))${SPACE}+[^ \\t\\n]+|-[^ \\t\\n]+)`;
export const GIT_PREFIX_SOURCE = `git(?:\\.exe)?["']?(?:${SPACE}+${OPTION})*${SPACE}+`;

// A quoted `git` that is the command word, blanked as text and restored after.
const QUOTED_GIT_COMMAND = /(?:^|[;&|(\n])[ \t]*(["'])(git(?:\.exe)?)\1/g;

// A git prefix, arguments up to a message flag, then a bare plain word.
const GIT_MESSAGE_WORD = new RegExp(
  `((?:^|[;&|(\`/\\n])[ \\t]*["']?${GIT_PREFIX_SOURCE}(?:[^;&|\\n]|(?<=\\\\)\\n)*?(?<=[ \\t\\n])(?:-[a-zA-Z]*m|--message=?)[ \\t]*)([^\\s;&|"'\`$()<>\\\\]+)`,
  'g'
);

export function blankCommandText(command) {
  const characters = command.split('');
  let position = 0;

  const blank = (index) => {
    if (characters[index] !== '\n') characters[index] = ' ';
  };

  const blankRange = (start, end) => {
    for (let index = start; index < end; index += 1) blank(index);
  };

  // Blanks text up to the closing `quote` or `limit`, scanning substitutions as code.
  function scanText(quote, limit) {
    while (position < limit) {
      const character = command[position];
      if (character === quote) {
        position += 1;
        return;
      }
      if (character === '\\') {
        blankRange(position, position + 2);
        position += 2;
      } else if (character === '$' && command[position + 1] === '(') {
        position += 2;
        scanCode(')');
      } else if (character === '`') {
        position += 1;
        scanCode('`');
      } else {
        blank(position);
        position += 1;
      }
    }
  }

  function scanSingleQuoted() {
    const end = command.indexOf("'", position + 1);
    const closing = end === -1 ? command.length : end;
    blankRange(position + 1, closing);
    position = Math.min(closing + 1, command.length);
  }

  // Reads the heredoc bodies that start on the line after the operators.
  function scanHeredocBodies(heredocs) {
    for (const heredoc of heredocs) {
      const bodyStart = position;
      let lineStart = position;
      let bodyEnd = command.length;
      let next = command.length;
      while (lineStart < command.length) {
        const newline = command.indexOf('\n', lineStart);
        const lineEnd = newline === -1 ? command.length : newline;
        const line = command.slice(lineStart, lineEnd);
        const candidate = heredoc.stripTabs ? line.replace(/^\t+/, '') : line;
        if (candidate === heredoc.delimiter) {
          bodyEnd = lineStart;
          next = lineEnd;
          break;
        }
        lineStart = lineEnd + 1;
      }
      if (heredoc.quoted) {
        blankRange(bodyStart, bodyEnd);
      } else {
        scanText(null, bodyEnd);
      }
      position = Math.max(next, bodyEnd);
    }
  }

  // Scans code up to `terminator`: `)` at depth zero, a backtick, or the end.
  function scanCode(terminator) {
    const heredocs = [];
    let depth = 0;
    while (position < command.length) {
      const character = command[position];
      if (character === '\\') {
        position += 2;
      } else if (character === "'") {
        scanSingleQuoted();
      } else if (character === '"') {
        position += 1;
        scanText('"', command.length);
      } else if (character === '$' && command[position + 1] === '(') {
        position += 2;
        scanCode(')');
      } else if (character === '`') {
        position += 1;
        if (terminator === '`') return;
        scanCode('`');
      } else if (terminator === ')' && character === '(') {
        depth += 1;
        position += 1;
      } else if (terminator === ')' && character === ')') {
        position += 1;
        if (depth === 0) return;
        depth -= 1;
      } else if (command.startsWith('<<<', position)) {
        position += 3;
      } else if (character === '<' && command[position + 1] === '<') {
        HEREDOC_OPERATOR.lastIndex = position;
        const match = HEREDOC_OPERATOR.exec(command);
        if (match) {
          const [operator, dash, singleQuoted, doubleQuoted, bare] = match;
          heredocs.push({
            delimiter: singleQuoted ?? doubleQuoted ?? bare,
            stripTabs: dash === '-',
            quoted: bare === undefined
          });
          position += operator.length;
        } else {
          position += 2;
        }
      } else if (character === '\n') {
        position += 1;
        scanHeredocBodies(heredocs.splice(0));
      } else {
        position += 1;
      }
    }
  }

  scanCode(null);

  for (const match of command.matchAll(QUOTED_GIT_COMMAND)) {
    const quoteIndex = match.index + match[0].length - match[2].length - 2;
    if (characters[quoteIndex] !== command[quoteIndex]) continue;
    for (let index = quoteIndex + 1; index <= quoteIndex + match[2].length; index += 1) characters[index] = command[index];
  }

  const quotedBlanked = characters.join('');
  return quotedBlanked.replace(GIT_MESSAGE_WORD, (match, before, word) => before + ' '.repeat(word.length));
}

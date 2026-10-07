// Turns a shell command into the same string with the text that runs nothing
// blanked, so a guard matches the words that run and not the words in a message.
// Blanked: single-quoted and double-quoted text, heredoc bodies, and the bare
// word after a git `-m` or `--message`. Each blanked character becomes a space,
// so length, quote marks, line breaks and delimiter lines stay where they were.
// Kept: a `$(...)` or backtick substitution inside a double-quoted string or an
// unquoted heredoc body, because it runs. Ceiling: a command assembled from
// variables at run time reads as written, and a quote inside `$((...))`
// arithmetic is read as a quote.

// A heredoc operator and its delimiter, shared with destructive-guard, which
// reads the body a database client is fed.
export const HEREDOC_OPERATOR = /<<(-?)[ \t]*(?:'([A-Za-z_]\w*)'|"([A-Za-z_]\w*)"|\\?([A-Za-z_]\w*))/y;

// The words that start a git invocation, up to and with the whitespace before the
// subcommand, as regular-expression source for git-guard and writing-guard to
// share. Whitespace is a space, a tab or a `\`-newline continuation. The command
// is `git` with an optional `.exe` and a closing quote, so a path such as
// `/usr/bin/git` and a quoted `"git"` both count; the caller chooses what may
// precede it. A global option may repeat and appear in any order: `-C`, `-c`,
// `--git-dir`, `--work-tree` and `--namespace` take a separate value, every other
// one is a single token such as `--no-pager`.
// Ceiling: a `"git"` with a quote only counts at the start of a command, because
// blanking removes it anywhere else.
const SPACE = '(?:[ \\t]|\\\\\\n)';
const OPTION = `(?:(?:-[cC]|--(?:git-dir|work-tree|namespace))${SPACE}+[^ \\t\\n]+|-[^ \\t\\n]+)`;
export const GIT_PREFIX_SOURCE = `git(?:\\.exe)?["']?(?:${SPACE}+${OPTION})*${SPACE}+`;

// A quoted `git` that is the command word, blanked as text and restored after.
const QUOTED_GIT_COMMAND = /(?:^|[;&|(\n])[ \t]*(["'])(git(?:\.exe)?)\1/g;

// A git prefix at the start of a command, then arguments up to a message flag,
// then a bare word that holds no substitution, quote or separator.
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

  // Blanks text from `position` up to the closing `quote` (or `limit`), and
  // scans each substitution in it as code.
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

  // Scans code up to the `terminator` that ends the enclosing substitution:
  // `)` at depth zero, a closing backtick, or the end of the command.
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

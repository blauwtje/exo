// The terse display filter: removes stray articles from the chat lines of one
// delta, the display-only last layer under `replies=terse`. `stripArticles`
// takes a delta and whether it starts inside a code fence, and returns the
// filtered `{ text, inFence }`. Fenced code, inline code, quoted text, URLs,
// path and file-name tokens, blockquote lines, table rows and a closing `?`
// sentence that asks the user something stay unchanged.
//
// Known limit: a delta is read on its own, so its first token counts as a
// line start, and an article cut off at the end of a delta stays because no
// word follows it yet; an open fence carried into the next delta closes on ```
// only. Lift both by carrying the last partial line and the fence marker in the state.
// Imported as `#terse-display`.

const PROTECTED = /`[^`]*`|"[^"]*"|“[^”]*”|https?:\/\/\S+/g;
const PLACEHOLDER = '\u{E000}';
const PLACEHOLDER_ANY = new RegExp(PLACEHOLDER, 'g');
const WORD_START = new RegExp(`^[\\p{L}\\p{N}${PLACEHOLDER}]`, 'u');
const FENCE = /^\s*(```|~~~)/;
const USER_WORD = /\b(you|your|me|I)\b/i;
const ARTICLE = /^([(\[]*)(a|an|the)$/i;
const KEPT_IDIOMS = new Set(['few', 'little', 'bit', 'lot', 'couple', 'while']);
const LIST_MARKER = /^([-*+]|\d+[.)])$/;
const SENTENCE_END = /[.!?]$/;

function startsSentence(tokens, index) {
  const previous = tokens.slice(0, index).reverse().find((token) => !/^\s+$/.test(token));
  if (previous === undefined) return true;
  return SENTENCE_END.test(previous) || LIST_MARKER.test(previous);
}

function filterLine(line) {
  if (line.includes(PLACEHOLDER)) return line;
  const saved = [];
  const masked = line.replace(PROTECTED, (match) => {
    saved.push(match);
    return PLACEHOLDER;
  });
  const tokens = masked.split(/(\s+)/);
  const kept = [];
  let capitalizeNext = false;
  for (let index = 0; index < tokens.length; index += 1) {
    let token = tokens[index];
    if (capitalizeNext && token !== '' && !/^\s+$/.test(token)) {
      token = token.replace(/^\p{Ll}/u, (letter) => letter.toUpperCase());
      capitalizeNext = false;
    }
    const match = ARTICLE.exec(token);
    const next = tokens[index + 2];
    if (!match || next === undefined || !WORD_START.test(next)) {
      kept.push(token);
      continue;
    }
    const opensSentence = startsSentence(tokens, index);
    const isCapital = match[2][0] !== match[2][0].toLowerCase();
    if (isCapital && !opensSentence) {
      kept.push(token);
      continue;
    }
    if (match[2].toLowerCase() === 'a' && KEPT_IDIOMS.has(next.toLowerCase().replace(/[^\p{L}]+$/u, ''))) {
      kept.push(token);
      continue;
    }
    kept.push(match[1]);
    index += 1;
    capitalizeNext = opensSentence;
  }
  let position = 0;
  return kept.join('').replace(PLACEHOLDER_ANY, () => saved[position++]);
}

// Filters a line, but keeps its last sentence whole when that sentence ends in `?` and asks the
// user something (it names you, your, me or I); any other question is filtered like prose.
function filterChatLine(line) {
  if (!/\?\s*$/.test(line)) return filterLine(line);
  const [, before = '', question] = /^(.*[.!:;]\s+)?(.*)$/.exec(line);
  if (!USER_WORD.test(question)) return filterLine(line);
  return filterLine(before) + question;
}

export function stripArticles(delta, inFence) {
  let fence = inFence === true ? '```' : null;
  const lines = delta.split('\n').map((line) => {
    const marker = FENCE.exec(line);
    if (marker && fence === null) {
      fence = marker[1];
      return line;
    }
    if (marker && marker[1] === fence) {
      fence = null;
      return line;
    }
    if (fence !== null) return line;
    if (/^\s*[>|]/.test(line)) return line;
    return filterChatLine(line);
  });
  return { text: lines.join('\n'), inFence: fence !== null };
}

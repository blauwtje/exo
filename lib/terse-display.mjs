// The terse display filter: removes stray articles from the chat lines of one
// delta, the display-only last layer under `replies=terse`. `stripArticles`
// takes a delta and whether it starts inside a code fence, and returns the
// filtered `{ text, inFence }`. Fenced code, inline code, quoted text, URLs,
// path and file-name tokens, blockquote lines, table rows and lines ending in
// `?` stay unchanged.
//
// Known limit: a delta is read on its own, so its first token counts as a
// line start, and an article cut off at the end of a delta stays because no
// word follows it yet. Lift it by carrying the last partial line in the state.
// Imported as `#terse-display`.

const PROTECTED = /`[^`]*`|"[^"]*"|“[^”]*”|https?:\/\/\S+/g;
const PLACEHOLDER = '';
const ARTICLE = /^([(\[]*)(a|an|the)$/i;
const KEPT_IDIOMS = new Set(['few', 'little', 'bit', 'lot', 'couple', 'while']);
const LIST_MARKER = /^([-*+]|\d+[.)])$/;
const SENTENCE_END = /[.!?]$/;

function isPathToken(token) {
  const bare = token.replace(/[.,;:!?)\]}]+$/, '');
  return /[/\\]/.test(bare) || /\w\.[a-z][a-z0-9]{0,4}$/i.test(bare);
}

function startsSentence(tokens, index) {
  const previous = tokens.slice(0, index).reverse().find((token) => !/^\s+$/.test(token));
  if (previous === undefined) return true;
  return SENTENCE_END.test(previous) || LIST_MARKER.test(previous);
}

function filterLine(line) {
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
    if (!match || next === undefined || !/^[\p{L}\p{N}]/u.test(next)) {
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
  return kept.join('').replace(//g, () => saved[position++]);
}

export function stripArticles(delta, inFence) {
  let fenced = inFence === true;
  const lines = delta.split('\n').map((line) => {
    if (/^\s*```/.test(line)) {
      fenced = !fenced;
      return line;
    }
    if (fenced) return line;
    if (/^\s*[>|]/.test(line) || /\?\s*$/.test(line)) return line;
    return filterLine(line);
  });
  return { text: lines.join('\n'), inFence: fenced };
}

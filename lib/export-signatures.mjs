const FUNCTION_HEAD = /^(?:export\s+(?:default\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)|(?:export\s+(?:const|let|var)\s+|(?:module\.)?exports\.)([A-Za-z_$][\w$]*)\s*(?::[^=\n]*)?=\s*(?:async\s+)?(function\s*\*?\s*(?:[A-Za-z_$][\w$]*)?)?)\s*(?:<[^>(\n]*>)?\s*\(/gm;
const ARROW_AFTER_PARAMETERS = /^\s*(?::[^=\n]*)?=>/;
const OPENING = new Set(['(', '[', '{']);
const CLOSING = new Set([')', ']', '}']);
const QUOTES = new Set(['"', "'", '`']);

function closingParenthesis(source, start) {
  let depth = 1;
  let quote = null;
  for (let index = start; index < source.length; index += 1) {
    const character = source[index];
    if (quote !== null) {
      if (character === '\\') index += 1;
      else if (character === quote) quote = null;
    } else if (QUOTES.has(character)) {
      quote = character;
    } else if (OPENING.has(character)) {
      depth += 1;
    } else if (CLOSING.has(character)) {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function withoutComments(source) {
  let result = '';
  let quote = null;
  let index = 0;
  while (index < source.length) {
    const character = source[index];
    const pair = source.slice(index, index + 2);
    if (quote !== null) {
      if (character === '\\') {
        result += source.slice(index, index + 2);
        index += 2;
        continue;
      }
      if (character === quote) quote = null;
    } else if (QUOTES.has(character)) {
      quote = character;
    } else if (pair === '//') {
      const lineEnd = source.indexOf('\n', index);
      index = lineEnd === -1 ? source.length : lineEnd;
      result += ' ';
      continue;
    } else if (pair === '/*') {
      const blockEnd = source.indexOf('*/', index + 2);
      const commentEnd = blockEnd === -1 ? source.length : blockEnd + 2;
      result += ' ' + source.slice(index, commentEnd).replace(/[^\n]/g, '');
      index = commentEnd;
      continue;
    }
    result += character;
    index += 1;
  }
  return result;
}

function normalisedParameters(text) {
  return text.replace(/\s+/g, ' ').replace(/\s*,\s*/g, ', ').trim().replace(/,$/, '');
}

function opensAngle(text, index) {
  return text[index] === '<' && /[\w$]/.test(text[index - 1] ?? '');
}

function closesAngle(state, text, index) {
  return text[index] === '>' && state.angles > 0 && text[index - 1] !== '=';
}

function consumeQuoted(state, character) {
  if (character === state.quote) state.quote = null;
}

function consumeNested(state, text, index) {
  const character = text[index];
  if (opensAngle(text, index)) {
    state.depth += 1;
    state.angles += 1;
    return true;
  }
  if (closesAngle(state, text, index)) {
    state.depth -= 1;
    state.angles -= 1;
    return true;
  }
  if (OPENING.has(character)) state.depth += 1;
  else if (CLOSING.has(character)) state.depth -= 1;
  else return false;
  return true;
}

function isTopLevel(state, text, index) {
  const character = text[index];
  if (state.quote !== null) {
    consumeQuoted(state, character);
    return false;
  }
  if (QUOTES.has(character)) {
    state.quote = character;
    return false;
  }
  if (consumeNested(state, text, index)) return false;
  return state.depth === 0;
}

function* topLevelCharacters(text) {
  const state = { depth: 0, angles: 0, quote: null };
  for (let index = 0; index < text.length; index += 1) {
    if (state.quote !== null && text[index] === '\\') {
      index += 1;
      continue;
    }
    if (isTopLevel(state, text, index)) yield { index, character: text[index] };
  }
}

function topLevelParameters(text) {
  const parameters = [];
  let start = 0;
  for (const { index, character } of topLevelCharacters(text)) {
    if (character !== ',') continue;
    parameters.push(text.slice(start, index));
    start = index + 1;
  }
  parameters.push(text.slice(start));
  return parameters.map((parameter) => parameter.trim()).filter((parameter) => parameter !== '');
}

function hasTopLevelDefault(parameter) {
  for (const { index, character } of topLevelCharacters(parameter)) {
    if (character === '=' && !/[=!<>]/.test(parameter[index - 1] ?? '') && !/[=>]/.test(parameter[index + 1] ?? '')) return true;
  }
  return false;
}

const OPTIONAL_MARK = /^[A-Za-z_$][\w$]*\?/;

function parameterShape(text) {
  const parameters = topLevelParameters(text);
  const hasRest = parameters.at(-1)?.startsWith('...') ?? false;
  const required = parameters.filter((parameter) => !parameter.startsWith('...') && !OPTIONAL_MARK.test(parameter) && !hasTopLevelDefault(parameter)).length;
  return { text, total: parameters.length, required, hasRest };
}

export function exportSignatures(rawSource) {
  const source = withoutComments(rawSource);
  const signatures = new Map();
  for (const match of source.matchAll(FUNCTION_HEAD)) {
    const name = match[1] ?? match[2];
    const start = match.index + match[0].length;
    const end = closingParenthesis(source, start);
    if (end === -1 || signatures.has(name)) continue;
    const isArrowForm = match[2] !== undefined && match[3] === undefined;
    if (isArrowForm && !ARROW_AFTER_PARAMETERS.test(source.slice(end + 1))) continue;
    signatures.set(name, parameterShape(normalisedParameters(source.slice(start, end))));
  }
  return signatures;
}

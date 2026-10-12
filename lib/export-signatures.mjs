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

function topLevelParameters(text) {
  const parameters = [];
  let depth = 0;
  let angles = 0;
  let quote = null;
  let start = 0;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quote !== null) {
      if (character === '\\') index += 1;
      else if (character === quote) quote = null;
    } else if (QUOTES.has(character)) {
      quote = character;
    } else if (character === '<' && /[\w$]/.test(text[index - 1] ?? '')) {
      depth += 1;
      angles += 1;
    } else if (character === '>' && angles > 0 && text[index - 1] !== '=') {
      depth -= 1;
      angles -= 1;
    } else if (OPENING.has(character)) {
      depth += 1;
    } else if (CLOSING.has(character)) {
      depth -= 1;
    } else if (character === ',' && depth === 0) {
      parameters.push(text.slice(start, index));
      start = index + 1;
    }
  }
  parameters.push(text.slice(start));
  return parameters.map((parameter) => parameter.trim()).filter((parameter) => parameter !== '');
}

const OPTIONAL_PARAMETER = /^[A-Za-z_$][\w$]*\?|^[^=]*[^=!<>]=(?![=>])/;

function parameterShape(text) {
  const parameters = topLevelParameters(text);
  const hasRest = parameters.at(-1)?.startsWith('...') ?? false;
  const required = parameters.filter((parameter) => !parameter.startsWith('...') && !OPTIONAL_PARAMETER.test(parameter)).length;
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

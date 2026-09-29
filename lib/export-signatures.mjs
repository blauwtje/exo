// The parameter list of each exported function a JavaScript or TypeScript
// source declares, read by pattern at the start of a line with no parser, the
// way map-source reads export names: `export (default )(async )function name(`,
// `export const name = (async )(` ending in `=>`, `export const name =
// (async )function (`, and `exports.name =` of those forms. Not read: class
// methods, `export { a as b }` aliases, a single bare arrow parameter,
// `module.exports = { ... }`, and overloads beyond the first. Each list keeps
// its text up to the matching `)` with whitespace collapsed, plus its shape:
// how many parameters it holds, how many a caller must pass, and whether it
// ends in a rest parameter.

const FUNCTION_HEAD = /^(?:export\s+(?:default\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)|(?:export\s+(?:const|let|var)\s+|(?:module\.)?exports\.)([A-Za-z_$][\w$]*)\s*(?::[^=\n]*)?=\s*(?:async\s+)?(function\s*\*?\s*(?:[A-Za-z_$][\w$]*)?)?)\s*(?:<[^>(\n]*>)?\s*\(/gm;
const ARROW_AFTER_PARAMETERS = /^\s*(?::[^=\n]*)?=>/;
const OPENING = new Set(['(', '[', '{']);
const CLOSING = new Set([')', ']', '}']);
const QUOTES = new Set(['"', "'", '`']);

// The index of the `)` closing the list that opens just before `start`, past
// nested brackets and quoted defaults, or -1 when the source ends first.
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

function normalisedParameters(text) {
  return text.replace(/\s+/g, ' ').replace(/\s*,\s*/g, ', ').trim().replace(/,$/, '');
}

// The list split on its top-level commas: a comma inside a destructuring
// pattern, a default's call, a quoted string or a generic type stays put. The
// `>` of an arrow `=>` in a default closes no generic.
function topLevelParameters(text) {
  const parameters = [];
  let depth = 0;
  let quote = null;
  let start = 0;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quote !== null) {
      if (character === '\\') index += 1;
      else if (character === quote) quote = null;
    } else if (QUOTES.has(character)) {
      quote = character;
    } else if (OPENING.has(character) || character === '<') {
      depth += 1;
    } else if (CLOSING.has(character) || (character === '>' && text[index - 1] !== '=')) {
      depth -= 1;
    } else if (character === ',' && depth === 0) {
      parameters.push(text.slice(start, index));
      start = index + 1;
    }
  }
  parameters.push(text.slice(start));
  return parameters.map((parameter) => parameter.trim()).filter((parameter) => parameter !== '');
}

// A parameter a caller may leave out: a default (a top-level `=` that is not
// part of `=>`, `==` or `<=`) or a TypeScript `name?`.
const OPTIONAL_PARAMETER = /^[A-Za-z_$][\w$]*\?|^[^=]*[^=!<>]=(?![=>])/;

function parameterShape(text) {
  const parameters = topLevelParameters(text);
  const hasRest = parameters.at(-1)?.startsWith('...') ?? false;
  const required = parameters.filter((parameter) => !parameter.startsWith('...') && !OPTIONAL_PARAMETER.test(parameter)).length;
  return { text, total: parameters.length, required, hasRest };
}

// Map of exported function name to its parameter list: `text`, `total`,
// `required` and `hasRest`.
export function exportSignatures(source) {
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

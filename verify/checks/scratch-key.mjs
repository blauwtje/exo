import { moduleFiles } from './script-syntax.mjs';

const ALLOWED = {};

const SCANNED = /^(lib\/|hooks\/|skills\/[^/]+\/scripts\/)/;
const CALL = /(?<![\w.])scratchPath\(/g;
const QUOTES = '\'"`';

function skipString(text, start) {
  const quote = text[start];
  let index = start + 1;
  let varying = false;
  while (index < text.length && text[index] !== quote) {
    if (text[index] === '\\') index += 1;
    else if (quote === '`' && text[index] === '$' && text[index + 1] === '{') varying = true;
    index += 1;
  }
  return { end: index, varying };
}

function secondArgumentVaries(text, open) {
  let depth = 0;
  let argument = 0;
  let varying = false;
  for (let index = open; index < text.length; index += 1) {
    const char = text[index];
    if (QUOTES.includes(char)) {
      const string = skipString(text, index);
      varying ||= argument === 1 && depth === 1 && string.varying;
      index = string.end;
    } else if ('([{'.includes(char)) depth += 1;
    else if (')]}'.includes(char)) {
      depth -= 1;
      if (depth === 0) return varying;
    } else if (char === ',' && depth === 1) argument += 1;
    else if (char === '+' && depth === 1 && argument === 1) varying = true;
  }
  return varying;
}

function varyingCalls(text) {
  return [...text.matchAll(CALL)]
    .filter((match) => secondArgumentVaries(text, match.index + match[0].length - 1))
    .map((match) => text.slice(0, match.index).split('\n').length);
}

export function checkScratchKey(report, repository) {
  const found = moduleFiles(repository)
    .map((file) => repository.relative(file))
    .filter((name) => SCANNED.test(name) && !(name in ALLOWED))
    .flatMap((name) => varyingCalls(repository.lines(repository.join(name)).join('\n'))
      .map((line) => `scratch key: ${name}:${line} passes a varying name to scratchPath; use taskScratchPath or allowlist it with its scope`));
  report.assert(
    found.length === 0,
    'scratch key',
    { pass: 'no scratchPath call passes a varying name', fail: found.join('; ') }
  );
}

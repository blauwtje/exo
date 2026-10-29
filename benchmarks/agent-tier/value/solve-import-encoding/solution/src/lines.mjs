import { StringDecoder } from 'node:string_decoder';

const BOM = '﻿';

export async function* readLines(source) {
  const decoder = new StringDecoder('utf8');
  let rest = '';
  let started = false;
  for await (const chunk of source) {
    rest += decoder.write(chunk);
    if (!started && rest.length > 0) {
      rest = rest.startsWith(BOM) ? rest.slice(1) : rest;
      started = true;
    }
    const parts = rest.split('\n');
    rest = parts.pop();
    yield* parts.map((part) => part.replace(/\r$/, ''));
  }
  rest += decoder.end();
  if (rest) yield rest.replace(/\r$/, '');
}

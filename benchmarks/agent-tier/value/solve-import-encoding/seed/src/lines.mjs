export async function* readLines(source) {
  let rest = '';
  for await (const chunk of source) {
    rest += chunk.toString();
    const parts = rest.split('\n');
    rest = parts.pop();
    yield* parts;
  }
  if (rest) yield rest;
}

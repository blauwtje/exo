import { readLines } from './lines.mjs';

export async function importUsers(source) {
  const lines = readLines(source);
  const first = await lines.next();
  if (first.done) return [];
  const header = first.value.split(',');
  if (!header.includes('email')) throw new Error('missing column: email');
  const users = [];
  for await (const line of lines) {
    if (line === '') continue;
    const cells = line.split(',');
    users.push(Object.fromEntries(header.map((name, index) => [name, cells[index]])));
  }
  return users;
}

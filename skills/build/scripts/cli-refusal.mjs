import { gitLine } from '#git';

export class Refusal extends Error {}

export function checkoutRoot(directory) {
  const root = gitLine(directory, ['rev-parse', '--show-toplevel']);
  if (root === null) throw new Refusal(`${directory} is not inside a git repository`);
  return root;
}

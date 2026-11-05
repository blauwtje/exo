import process from 'node:process';
import { gitLine } from '#git';

export class Refusal extends Error {}

export function checkoutRoot() {
  const root = gitLine(process.cwd(), ['rev-parse', '--show-toplevel']);
  if (root === null) throw new Refusal(`${process.cwd()} is not inside a git repository`);
  return root;
}

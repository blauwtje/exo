import { parseAmount } from './parse.mjs';

export function totalOf(lines) {
  return lines.filter((line) => line.trim() !== '').reduce((total, line) => total + parseAmount(line), 0);
}

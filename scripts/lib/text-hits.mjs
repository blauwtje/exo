import fs from 'node:fs';
import { listedFiles } from '../checks/script-syntax.mjs';

function hitsInFile(repository, file, hitsOfLine) {
  const text = fs.readFileSync(file, 'utf8');
  if (text.includes('\0')) return [];
  return text.split('\n').flatMap((line, index) => hitsOfLine(line)
    .map((hit) => `${repository.relative(file)}:${index + 1} ${hit}`));
}

export function textHits(repository, hitsOfLine) {
  return listedFiles(repository, () => true).flatMap((file) => hitsInFile(repository, file, hitsOfLine));
}

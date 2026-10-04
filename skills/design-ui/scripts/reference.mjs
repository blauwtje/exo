// The product or style a project's look resembles, kept as the `reference`
// field in its docs/design/DESIGN.md front matter, so each project keeps its
// own look and the design-ui form asks only once per project.
//
//   node scripts/reference.mjs [--root <dir>]               prints the saved reference, or nothing
//   node scripts/reference.mjs --set <name> [--root <dir>]  saves <name> as the project's reference

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { isMain } from '#script-flags';
import { parseFrontmatter } from './context.mjs';

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

export function designFile(root = '.') {
  return path.join(path.resolve(root), 'docs', 'design', 'DESIGN.md');
}

function readText(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

export function savedReference(file = designFile()) {
  const text = readText(file);
  if (text === null) return '';
  const { reference } = parseFrontmatter(text).values;
  return typeof reference === 'string' ? reference : '';
}

// A project without DESIGN.md gets a draft one holding only the reference, so the
// routing never mistakes it for an approved identity.
export function saveReference(name, file = designFile()) {
  const reference = name.replace(/\s+/g, ' ').trim();
  if (!reference) throw new Error('--set needs a product or style');
  const line = `reference: ${reference}`;
  const text = readText(file);
  let next;
  if (text === null) {
    next = `---\nschema: ui-design/v1\nstatus: draft\n${line}\n---\n\n# Design\n`;
  } else {
    const match = FRONTMATTER.exec(text);
    if (!match) {
      next = `---\n${line}\n---\n\n${text}`;
    } else {
      const lines = match[1].split(/\r?\n/).filter((entry) => !/^reference:/.test(entry));
      next = `---\n${[...lines, line].join('\n')}\n---\n${text.slice(match[0].length)}`;
    }
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, next);
  return reference;
}

if (isMain(import.meta.url)) {
  const args = process.argv.slice(2);
  try {
    let root = '.';
    let name;
    while (args.length > 0) {
      const flag = args.shift();
      if (flag === '--root') root = args.shift() ?? '';
      else if (flag === '--set') name = args.shift() ?? '';
      else throw new Error(`unknown argument: ${flag}`);
    }
    const file = designFile(root);
    if (name !== undefined) console.log(`saved: ${saveReference(name, file)}`);
    else console.log(savedReference(file));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 2;
  }
}

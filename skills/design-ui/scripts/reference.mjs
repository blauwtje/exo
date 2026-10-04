// The product or style a project's look resembles, kept as the `reference`
// field in its docs/design/DESIGN.md front matter, so each project keeps its
// own look and the design-ui form asks only once per project. The chosen
// `display-font`, `body-font` and `accent` sit beside it.
//
//   node scripts/reference.mjs [--root <dir>]               prints the saved reference, or nothing
//   node scripts/reference.mjs --set <name> [--root <dir>]  saves <name> as the project's reference
//   node scripts/reference.mjs [--display-font <font>] [--body-font <font>] [--accent <color>] [--root <dir>]
//                                                           saves the given picks; any mix with --set

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

// A project without DESIGN.md gets a draft one holding only the saved fields, so the
// routing never mistakes it for an approved identity.
export function saveFields(fields, file = designFile()) {
  const entries = Object.entries(fields).filter(([, value]) => value !== undefined);
  const saved = {};
  for (const [key, value] of entries) {
    saved[key] = value.replace(/\s+/g, ' ').trim();
    if (!saved[key]) throw new Error(`--${key} needs a value`);
  }
  const keys = Object.keys(saved);
  if (keys.length === 0) throw new Error('nothing to save');
  const lines = keys.map((key) => `${key}: ${saved[key]}`);
  const text = readText(file);
  let next;
  if (text === null) {
    next = `---\nschema: ui-design/v1\nstatus: draft\n${lines.join('\n')}\n---\n\n# Design\n`;
  } else {
    const match = FRONTMATTER.exec(text);
    if (!match) {
      next = `---\n${lines.join('\n')}\n---\n\n${text}`;
    } else {
      const kept = match[1].split(/\r?\n/).filter((entry) => !keys.some((key) => entry.startsWith(`${key}:`)));
      next = `---\n${[...kept, ...lines].join('\n')}\n---\n${text.slice(match[0].length)}`;
    }
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, next);
  return lines.join(', ');
}

if (isMain(import.meta.url)) {
  const args = process.argv.slice(2);
  try {
    let root = '.';
    const fields = {};
    while (args.length > 0) {
      const flag = args.shift();
      if (flag === '--root') root = args.shift() ?? '';
      else if (flag === '--set') fields.reference = args.shift() ?? '';
      else if (flag === '--display-font') fields['display-font'] = args.shift() ?? '';
      else if (flag === '--body-font') fields['body-font'] = args.shift() ?? '';
      else if (flag === '--accent') fields.accent = args.shift() ?? '';
      else throw new Error(`unknown argument: ${flag}`);
    }
    const file = designFile(root);
    if (Object.keys(fields).length > 0) console.log(`saved: ${saveFields(fields, file)}`);
    else console.log(savedReference(file));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 2;
  }
}

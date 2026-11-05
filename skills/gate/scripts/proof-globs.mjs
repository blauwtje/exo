import fs from 'node:fs';
import path from 'node:path';

const TEST_FILES_PROOF = /^node --test( [\w./-]+)+$/;

export function packageScripts(root) {
  let manifest;
  try {
    manifest = fs.readFileSync(path.join(root, 'package.json'), 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw error;
  }
  return JSON.parse(manifest).scripts ?? {};
}

export function suiteGlobs(scripts) {
  const script = scripts.test ?? '';
  if (!script.startsWith('node --test ')) return [];
  const words = script.match(/"[^"]*"|'[^']*'|\S+/g).slice(2);
  return words.filter((word) => !word.startsWith('-')).map((word) => word.replace(/^["']|["']$/g, ''));
}

function globMatches(glob, file) {
  const pattern = glob.replace(/[.+^${}()|[\]\\?]/g, '\\$&').replace(/\*\*\/?/g, '\0').replace(/\*/g, '[^/]*').replace(/\0/g, '(.*/)?');
  return new RegExp(`^${pattern}$`).test(file);
}

export function filesUnderGlobs(command, globs) {
  if (!TEST_FILES_PROOF.test(command)) return false;
  const files = command.split(' ').slice(2).map((file) => file.replace(/^\.\//, ''));
  return files.every((file) => globs.some((glob) => globMatches(glob, file)));
}

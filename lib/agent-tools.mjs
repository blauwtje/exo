import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PLUGIN_ROOT = fileURLToPath(new URL('../', import.meta.url));
const PLUGIN_PREFIX = 'exo:';
const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---/;
const TOOLS_LINE = /^tools:[ \t]*(.*)$/m;

function definitionPath(type, cwd) {
  if (type.startsWith(PLUGIN_PREFIX)) return path.join(PLUGIN_ROOT, 'agents', `${type.slice(PLUGIN_PREFIX.length)}.md`);
  if (type.includes(':') || !cwd) return null;
  return path.join(cwd, '.claude', 'agents', `${type}.md`);
}

function definitionText(type, cwd) {
  const file = definitionPath(type, cwd);
  if (!file) return '';
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return '';
  }
}

export function agentTools(type = 'general-purpose', cwd) {
  const line = TOOLS_LINE.exec(FRONTMATTER.exec(definitionText(type, cwd))?.[1] ?? '')?.[1];
  if (line === undefined) return null;
  return line.split(/[\s,[\]]+/).filter(Boolean);
}

export function agentCanWrite(type, cwd) {
  return agentTools(type, cwd)?.includes('Write') ?? true;
}

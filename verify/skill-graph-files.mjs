import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(SCRIPT_DIR, '..');

function toPosix(relativePath) {
  return relativePath.split(path.sep).join('/');
}

export function relFromRoot(absolutePath) {
  return toPosix(path.relative(ROOT, absolutePath));
}

function walkFilesWithExtension(dir, extension) {
  const found = [];
  if (!fs.existsSync(dir)) return found;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...walkFilesWithExtension(full, extension));
    else if (entry.name.endsWith(extension)) found.push(full);
  }
  return found;
}

export function listDocFiles() {
  const files = [];
  const skillsDir = path.join(ROOT, 'skills');
  for (const entry of fs.readdirSync(skillsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const skillMd = path.join(skillsDir, entry.name, 'SKILL.md');
    if (fs.existsSync(skillMd)) files.push(skillMd);
    const referencesDir = path.join(skillsDir, entry.name, 'references');
    if (fs.existsSync(referencesDir)) {
      for (const ref of fs.readdirSync(referencesDir)) {
        if (ref.endsWith('.md')) files.push(path.join(referencesDir, ref));
      }
    }
  }
  const agentsDir = path.join(ROOT, 'agents');
  if (fs.existsSync(agentsDir)) {
    for (const agent of fs.readdirSync(agentsDir)) {
      if (agent.endsWith('.md')) files.push(path.join(agentsDir, agent));
    }
  }
  for (const rootDoc of ['README.md', 'CONTRIBUTING.md', '.claude/CLAUDE.md', '.claude/landing.md']) {
    const full = path.join(ROOT, rootDoc);
    if (fs.existsSync(full)) files.push(full);
  }
  const docsSkillsDir = path.join(ROOT, 'docs', 'skills');
  if (fs.existsSync(docsSkillsDir)) {
    for (const doc of fs.readdirSync(docsSkillsDir)) {
      if (doc.endsWith('.md')) files.push(path.join(docsSkillsDir, doc));
    }
  }
  return files;
}

export function listCodeFiles() {
  const files = [];
  const hooksDir = path.join(ROOT, 'hooks');
  if (fs.existsSync(hooksDir)) {
    for (const entry of fs.readdirSync(hooksDir, { withFileTypes: true })) {
      if (entry.isFile()) files.push(path.join(hooksDir, entry.name));
    }
  }
  const verifyMjs = path.join(ROOT, 'verify.mjs');
  if (fs.existsSync(verifyMjs)) files.push(verifyMjs);
  files.push(...walkFilesWithExtension(path.join(ROOT, 'verify'), '.mjs'));
  files.push(...walkFilesWithExtension(path.join(ROOT, 'tests'), '.mjs'));
  return files;
}

export function skillNameFromPath(relativePath) {
  const match = /^skills\/([^/]+)\//.exec(relativePath);
  return match ? match[1] : null;
}

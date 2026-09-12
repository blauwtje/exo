// Markdown reading shared by the prose checks: the body below a SKILL.md
// frontmatter, and the link targets a file points at.

import path from 'node:path';

const TARGET_PATTERNS = [
  /\[[^\]]*\]\((?<target>[^)]+\.md(?:#[^)]*)?)\)/g,
  /`(?<target>[^`\r\n]+\.md)`/g,
  /^\[[^\]]+\]:\s*(?<target>\S+\.md(?:#\S+)?)\s*$/gm
];

const SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;
const HARNESS_ROOT_FILES = ['AGENTS.md', 'CLAUDE.md'];

export function markdownBody(fileName, text) {
  if (fileName !== 'SKILL.md') return text;
  return text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '');
}

// Port of Get-MarkdownTargets (verify.ps1:310-327): inline links, inline code
// spans and link-reference definitions, deduplicated case-insensitively the way
// the PowerShell HashSet does.
export function markdownTargets(text) {
  const seen = new Map();
  for (const pattern of TARGET_PATTERNS) {
    for (const match of text.matchAll(pattern)) {
      const target = match.groups.target.trim();
      const key = target.toLowerCase();
      if (!seen.has(key)) seen.set(key, target);
    }
  }
  return [...seen.values()];
}

// Port of Resolve-MarkdownTarget (verify.ps1:328-347): the absolute path a
// target names, or null when the target names no single local file.
export function resolveMarkdownTarget(file, target) {
  const withoutFragment = target.split('#')[0];
  // A `<>` placeholder and a `*`/`?` glob both name a set of files rather than one file,
  // and a `$VAR` segment names a directory the caller fills at dispatch time, so none of
  // the three can resolve to a leaf and none is a broken reference.
  if (withoutFragment.trim() === ''
    || SCHEME.test(withoutFragment)
    || /[<>]/.test(withoutFragment)
    || /[*?]/.test(withoutFragment)
    || withoutFragment.includes('$')
    || HARNESS_ROOT_FILES.some((name) => name.toLowerCase() === withoutFragment.toLowerCase())) {
    return null;
  }
  return path.resolve(path.dirname(file), withoutFragment);
}

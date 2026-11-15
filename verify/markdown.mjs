import path from 'node:path';

const TARGET_PATTERNS = [
  /\[[^\]]*\]\((?<target>[^)]+\.md(?:#[^)]*)?)\)/g,
  /`(?<target>[^`\r\n]+\.md)`/g,
  /^\[[^\]]+\]:\s*(?<target>\S+\.md(?:#\S+)?)\s*$/gm
];

const SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;
const HARNESS_ROOT_FILES = ['AGENTS.md', 'CLAUDE.md'];
export function markdownTargets(text) {
  const seen = new Map();
  const targets = TARGET_PATTERNS.flatMap((pattern) => {
    return [...text.matchAll(pattern)].map((match) => match.groups.target.trim());
  });
  for (const target of targets) {
    const key = target.toLowerCase();
    if (!seen.has(key)) seen.set(key, target);
  }
  return [...seen.values()];
}

export function resolveMarkdownTarget(file, target) {
  const withoutFragment = target.split('#')[0];
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

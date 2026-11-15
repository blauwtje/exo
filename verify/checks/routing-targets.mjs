import fs from 'node:fs';
import path from 'node:path';
import { CONTEXT_FILES } from './hook-budgets.mjs';

const BUILD_MODE = /`(?:exo:)?build ([a-z][a-z-]*)`/g;
const ROUTED = /`(?:exo:)?([a-z][a-z-]*)`|exo:([a-z][a-z-]*)/g;

function names(root, directory, suffix) {
  const full = path.join(root, directory);
  if (!fs.existsSync(full)) return [];
  return fs.readdirSync(full).map((entry) => entry.replace(suffix, ''));
}

function documentedModes(root) {
  const text = fs.readFileSync(path.join(root, 'skills/build/SKILL.md'), 'utf8');
  const section = /^## Modes\n([\s\S]*?)(?=\n## )/m.exec(text)?.[1] ?? '';
  return [...section.matchAll(/`([a-z][a-z-]*)`/g)].map((match) => match[1]);
}

function unroutableTargets(root) {
  const known = new Set([...names(root, 'skills', ''), ...names(root, 'agents', /\.md$/)]);
  const modes = new Set(documentedModes(root));
  const missing = CONTEXT_FILES.flatMap((file) => {
    const text = fs.readFileSync(path.join(root, file), 'utf8');
    const badModes = [...text.matchAll(BUILD_MODE)]
      .filter((match) => !modes.has(match[1]))
      .map((match) => `${file}: build ${match[1]}`);
    const badTargets = [...text.replace(BUILD_MODE, '').matchAll(ROUTED)]
      .map((match) => match[1] ?? match[2])
      .filter((name) => !known.has(name))
      .map((name) => `${file}: ${name}`);
    return [...badModes, ...badTargets];
  });
  return [...new Set(missing)];
}

export function checkRoutingTargets(report, repository) {
  const missing = unroutableTargets(repository.root);
  report.assert(
    missing.length === 0,
    'routing targets',
    { pass: 'every skill the session hooks route to is a skill directory, an agent or a build mode', fail: `no such target: ${missing.join(', ')}` }
  );
}

import fs from 'node:fs';
import path from 'node:path';

const ROUTING_FILES = ['hooks/session-routing.md', 'hooks/session-rules.md'];
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

export function unroutableTargets(root) {
  const known = new Set([...names(root, 'skills', ''), ...names(root, 'agents', /\.md$/)]);
  const modes = new Set(documentedModes(root));
  const missing = [];
  for (const file of ROUTING_FILES) {
    const text = fs.readFileSync(path.join(root, file), 'utf8');
    for (const match of text.matchAll(BUILD_MODE)) if (!modes.has(match[1])) missing.push(`${file}: build ${match[1]}`);
    for (const match of text.replace(BUILD_MODE, '').matchAll(ROUTED)) {
      const name = match[1] ?? match[2];
      if (!known.has(name)) missing.push(`${file}: ${name}`);
    }
  }
  return [...new Set(missing)];
}

export function checkRoutingTargets(report, repository) {
  const missing = unroutableTargets(repository.root);
  report.assert(
    missing.length === 0,
    'routing targets',
    'every skill the session hooks route to is a skill directory, an agent or a build mode',
    `no such target: ${missing.join(', ')}`
  );
}

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { isMain, parseFlags, UsageError } from '#script-flags';
import { shippedBriefs } from '#shipped-briefs';

const USAGE = 'usage: behaviour.mjs [--root <repository>] [--check]\nWrites docs/behaviour/<area>.md from the acceptance lines of the briefs git tracks under docs/specs and docs/plans; --check writes nothing and exits 1 when a file is stale.';
const FOLDER = 'docs/behaviour';

function areaFile(area, entries) {
  const sections = entries.map(({ name, lines }) => `## ${name}\n${lines.map((line) => `- ${line}`).join('\n')}`);
  const header = [
    `# ${area}: current behaviour`,
    '',
    'Built by `node skills/spec/scripts/behaviour.mjs` from the acceptance lines of the shipped briefs; edit a brief, not this file. A brief that holds a `Supersedes: <brief name>` line replaces that brief.'
  ];
  return `${header.join('\n')}\n\n${sections.join('\n\n')}\n`;
}

export function renderBehaviour(root) {
  const { briefs, unreadable } = shippedBriefs(root);
  const byArea = new Map();
  for (const brief of briefs) {
    for (const { text, areas } of brief.acceptance) {
      for (const area of areas) {
        const entries = byArea.get(area) ?? [];
        const entry = entries.find((candidate) => candidate.name === brief.name) ?? entries[entries.push({ name: brief.name, lines: [] }) - 1];
        entry.lines.push(text);
        byArea.set(area, entries);
      }
    }
  }
  const files = new Map([...byArea].sort().map(([area, entries]) => [`${FOLDER}/${area}.md`, areaFile(area, entries)]));
  return { files, unreadable };
}

export function behaviourDrift(root) {
  const { files, unreadable } = renderBehaviour(root);
  const folder = path.join(root, FOLDER);
  const present = fs.existsSync(folder) ? fs.readdirSync(folder).filter((name) => name.endsWith('.md')).map((name) => `${FOLDER}/${name}`) : [];
  const stale = [...files].filter(([file, text]) => !fs.existsSync(path.join(root, file)) || fs.readFileSync(path.join(root, file), 'utf8') !== text).map(([file]) => file);
  const extra = present.filter((file) => !files.has(file));
  return { stale: [...stale, ...extra], files, unreadable };
}

export function writeBehaviour(root) {
  const { stale, files, unreadable } = behaviourDrift(root);
  for (const file of stale) {
    const target = path.join(root, file);
    if (!files.has(file)) fs.rmSync(target);
    else {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, files.get(file));
    }
  }
  return { written: stale, unreadable };
}

function reportSkipped(unreadable) {
  for (const { file, reason } of unreadable) process.stderr.write(`behaviour: skipped ${file}: ${reason}\n`);
}

export function main(argv) {
  const flags = parseFlags(argv, { root: 'value', check: 'boolean' }, { usage: USAGE });
  const root = path.resolve(flags.root ?? process.cwd());
  if (!fs.existsSync(root)) throw new UsageError(`no repository at '${flags.root}'`);
  if (flags.check !== true) {
    const { written, unreadable } = writeBehaviour(root);
    reportSkipped(unreadable);
    process.stdout.write(`behaviour: updated ${written.length} file(s) under ${FOLDER}\n`);
    return;
  }
  const { stale, unreadable } = behaviourDrift(root);
  reportSkipped(unreadable);
  for (const file of stale) process.stdout.write(`stale: ${file}\n`);
  if (stale.length > 0) process.exitCode = 1;
}

if (isMain(import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    process.stderr.write(`behaviour: ${error.message}\n`);
    process.exitCode = 2;
  }
}

// Path and file-set questions every check asks of the repository under test.
// Relative paths are always forward-slashed: the detail strings they land in are
// compared against each other across macOS and Windows.

import fs from 'node:fs';
import path from 'node:path';
import { EXPECTED_SKILLS } from './budgets.mjs';

// PowerShell's Sort-Object orders paths case-insensitively, so a references/
// folder sorts before its sibling SKILL.md. Detail strings built from this order
// are compared against that output character for character.
function comparePaths(left, right) {
  const loweredLeft = left.toLowerCase();
  const loweredRight = right.toLowerCase();
  if (loweredLeft !== loweredRight) return loweredLeft < loweredRight ? -1 : 1;
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

export function createRepository(root) {
  const absoluteRoot = path.resolve(root);
  const skillsRoot = path.join(absoluteRoot, 'skills');

  function relative(target) {
    return path.relative(absoluteRoot, path.resolve(target)).split(path.sep).join('/');
  }

  // At the skills root only the skills the corpus contract names are walked:
  // skills/ also holds the workflow and meta skills, whose shape the
  // edit-skills skill governs until each is rewritten into this contract;
  // everySkillFile reaches them for the checks every skill must pass.
  function walk(directory, predicate) {
    const found = [];
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (directory === skillsRoot && !EXPECTED_SKILLS.includes(entry.name)) continue;
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) found.push(...walk(full, predicate));
      else if (entry.isFile() && predicate(full)) found.push(full);
    }
    return found.sort(comparePaths);
  }

  return {
    root: absoluteRoot,
    skillsRoot,
    relative,
    walk,
    join: (...segments) => path.join(absoluteRoot, ...segments),
    skillDirectories: () => fs.readdirSync(skillsRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && EXPECTED_SKILLS.includes(entry.name))
      .map((entry) => entry.name)
      .sort(),
    everySkillFile: () => fs.readdirSync(skillsRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(skillsRoot, entry.name, 'SKILL.md')))
      .map((entry) => path.join(skillsRoot, entry.name, 'SKILL.md'))
      .sort(comparePaths),
    // Get-ProcessFiles: every SKILL.md plus every .md inside a references/ folder.
    processFiles: () => walk(skillsRoot, (full) => path.basename(full) === 'SKILL.md'
      || (full.endsWith('.md') && path.basename(path.dirname(full)) === 'references')),
    // A delegate prompt sits beside its SKILL.md as <role>-prompt.md: text the skill
    // hands to an agent, so it carries no process structure of its own but still
    // keeps to the portable-language rules.
    promptFiles: () => walk(skillsRoot, (full) => full.endsWith('-prompt.md')
      && path.basename(path.dirname(path.dirname(full))) === 'skills'),
    // A plugin agent's body is its system prompt, so it keeps to the same rules
    // as a delegate prompt.
    agentFiles: () => {
      const agentsRoot = path.join(absoluteRoot, 'agents');
      if (!fs.existsSync(agentsRoot)) return [];
      return walk(agentsRoot, (full) => full.endsWith('.md'));
    },
    // ReadAllLines drops the newline that ends the last line; split does not.
    lines: (file) => {
      const text = fs.readFileSync(file, 'utf8');
      const split = text.split('\n');
      if (split.length > 0 && split[split.length - 1] === '') split.pop();
      return split;
    },
    text: (file) => fs.readFileSync(file, 'utf8')
  };
}

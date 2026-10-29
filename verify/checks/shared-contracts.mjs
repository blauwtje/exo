// The sentences two skills must state identically stay pinned, so a handshake
// cannot desync in one body alone. Every entry is a literal substring of the
// file it is keyed by; paths are relative to the repository root.

import fs from 'node:fs';
import path from 'node:path';
import { readFrontmatter } from '../frontmatter.mjs';
import { BYTES_PER_TOKEN, DESCRIPTION_CHARS, REFERENCE_CONTENTS_LINES, SKILL_BODY_TOKENS } from '../budgets.mjs';
import { FILE_LIMIT, LINE_LIMIT } from '../../skills/gate/scripts/pick-reviewer.mjs';
import { ATTESTATIONS_REQUIRED } from '../../lib/memory-store.mjs';
import { DEFAULT_MINUTES, TIMEOUT_EXIT } from '../../skills/ship/scripts/wait-checks.mjs';

// A doc writes a small count as a word, so a pin built from a constant spells it.
const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
// The reviewer is picked on risk; the file and line limits still set the code-review breadth.
const BREADTH_LIMITS = [`${NUMBER_WORDS[FILE_LIMIT]} changed files`, `${LINE_LIMIT} changed lines`];
// Mirrors taskReviewer in pick-reviewer.mjs: only a `Risk:` field naming a security boundary picks the deep reviewer.
const RISK_TRIGGER = 'landed task\'s `Risk:` field names a security boundary';

const thousands = (value) => value.toLocaleString('en-US');

const LABEL_LIMIT = 70;
const HANDSHAKE = /When a new visual surface does not name [^.]+; design-ui follows for presentation\./;

const PINNED_SENTENCES = {
  'skills/spec/SKILL.md': [
    'Spec always ends on a brief; with no open decision the brief still gets written.',
    'An open decision is one the user would notice that neither request nor code settles.',
    'Not for a clear goal, a failure, or visual-only work.',
  ],
  'skills/spec/references/brief.md': [
    'Store the brief where `specs` in the session\'s `exo settings:` line says, `docs` when that line is absent, and name its location in the same message',
  ],
  'skills/find-cause/SKILL.md': [
    'when it prints `changed files` above 2 or `dependency-added yes`, or the fix crosses a public signature, persisted format or security boundary',
    'Until the cause is proven this skill outranks `spec` and `build`; a read-only planning turn writes the plan per `../spec/references/task-list.md`, reproduction test as Task 1.',
  ],
  'skills/build/SKILL.md': [
    'Count these facts: over two source, test or config files change; a dependency is added; a public signature changes; a persisted format or security boundary is crossed; orientation missed a required file.',
    'After a compaction, rebuild what landed from the working-tree diff, not memory.',
    'When a symptom survives two fix attempts or a repair crosses a second owner, report both and hand it to `find-cause`.',
  ],
  'skills/build/reviewer-prompt.md': [
    ...BREADTH_LIMITS,
  ],
  'skills/check-docs/SKILL.md': [
    'Research pass ends the turn only when the question is standalone with no code to follow',
  ],
  'skills/edit-skills/SKILL.md': [
    `Aim the body at ${thousands(SKILL_BODY_TOKENS.realistic)} tokens (bytes after the frontmatter / ${BYTES_PER_TOKEN}) and the description at ${DESCRIPTION_CHARS.realistic} characters; the verifier fails ${thousands(SKILL_BODY_TOKENS.ceiling)} tokens and ${DESCRIPTION_CHARS.ceiling} characters.`,
    `A reference holds one topic and links to no other reference; over ${REFERENCE_CONTENTS_LINES} lines it opens with a contents list linking each section.`,
  ],
  'skills/edit-skills/references/description.md': [
    `Aim at ${DESCRIPTION_CHARS.realistic} characters and stay within ${DESCRIPTION_CHARS.ceiling}, so the sum across the corpus stays inside what the harness shows the model.`,
  ],
  'README.md': [
    `${NUMBER_WORDS[ATTESTATIONS_REQUIRED]} sessions`,
  ],
  'CONTRIBUTING.md': [
    RISK_TRIGGER,
  ],
  'docs/skills/build.md': [RISK_TRIGGER],
  'skills/ship/SKILL.md': [`stops after ${DEFAULT_MINUTES} minutes`, `exit ${TIMEOUT_EXIT}`],
  'skills/remember/SKILL.md': [`${NUMBER_WORDS[ATTESTATIONS_REQUIRED]} sessions`],
};

// A doc list that restates a data asset: every name the asset lists appears
// backticked in the doc section that states the list, and every name in that
// list is one the asset holds. The list is a run of backticked names joined
// only by list separators that holds at least one asset name; other backticked
// tokens in the section stand alone and are not checked. The asset is read
// from the repository under check.
const PINNED_LISTS = [];

const LIST_SEPARATOR = /^(?:, |,? (?:or|and|plus) )$/;

// Maximal runs of backticked tokens joined only by list separators.
function backtickRuns(body) {
  const runs = [];
  let previousEnd = -1;
  for (const match of body.matchAll(/`([^`\n]+)`/g)) {
    const joined = previousEnd !== -1 && LIST_SEPARATOR.test(body.slice(previousEnd, match.index));
    if (joined) runs.at(-1).push(match[1]);
    else runs.push([match[1]]);
    previousEnd = match.index + match[0].length;
  }
  return runs;
}

function checkPinnedLists(errors, repository) {
  for (const { file, section, asset, names } of PINNED_LISTS) {
    const text = repository.text(path.resolve(repository.root, file));
    const start = text.indexOf(`\n${section}\n`);
    if (start === -1) {
      errors.push(`${file}: no ${section} section to hold the list from ${asset}`);
      continue;
    }
    const end = text.indexOf('\n## ', start + section.length + 2);
    const body = text.slice(start, end === -1 ? undefined : end);
    const held = new Set(names(JSON.parse(repository.text(path.resolve(repository.root, asset)))));
    const missing = [...held].filter((name) => !body.includes(`\`${name}\``));
    if (missing.length > 0) errors.push(`${file}: ${section} lacks ${missing.join(', ')} from ${asset}`);
    const dropped = backtickRuns(body)
      .filter((run) => run.some((token) => held.has(token)))
      .flatMap((run) => run.filter((token) => !held.has(token)));
    if (dropped.length > 0) errors.push(`${file}: ${section} names ${dropped.join(', ')}, which ${asset} lacks`);
  }
}

export function checkSharedContracts(report, repository) {
  const errors = [];
  for (const [relative, fragments] of Object.entries(PINNED_SENTENCES)) {
    const file = path.resolve(repository.root, relative);
    if (!(fs.existsSync(file) && fs.statSync(file).isFile())) {
      errors.push(`${relative}: file is missing`);
      continue;
    }
    const content = repository.text(file);
    for (const fragment of fragments) {
      if (content.includes(fragment)) continue;
      const label = fragment.length > LABEL_LIMIT ? `${fragment.slice(0, LABEL_LIMIT)}…` : fragment;
      errors.push(`${relative}: missing pinned shared sentence '${label}'`);
    }
  }

  checkPinnedLists(errors, repository);

  // Spec decides a new visual surface's data and behavior before design-ui, so
  // spec's description alone carries the handshake sentence that routes it there.
  const specDescription = readFrontmatter(repository.lines(path.join(repository.skillsRoot, 'spec', 'SKILL.md'))).values.get('description') ?? '';
  if (!HANDSHAKE.test(specDescription)) {
    errors.push('spec: description lacks the spec/design-ui handshake sentence');
  }

  report.assert(
    errors.length === 0,
    'shared contracts',
    'pinned cross-file sentences, quality floors, handshake, and trigger table agree',
    errors.join('; ')
  );
}

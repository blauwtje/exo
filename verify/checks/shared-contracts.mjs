// The sentences two skills must state identically stay pinned, so a handshake
// cannot desync in one body alone. Every entry is a literal substring of the
// file it is keyed by; paths are relative to the repository root.

import fs from 'node:fs';
import path from 'node:path';
import { readFrontmatter } from '../frontmatter.mjs';
import { CLOSERS, OPTIONS_MAX, STATES } from '../../skills/shaping/scripts/question-page.mjs';
import { BYTES_PER_TOKEN, DESCRIPTION_CHARS, INJECTED_BODY_TOKENS, REFERENCE_CONTENTS_LINES, SKILL_BODY_TOKENS } from '../budgets.mjs';
import { FILE_LIMIT, LINE_LIMIT } from '../../skills/implementing/scripts/pick-reviewer.mjs';
import { ATTESTATIONS_REQUIRED } from '../../lib/memory-store.mjs';
import { CHARACTERS_PER_TOKEN, DEFAULT_GUARD_LINES, SESSION_RETENTION_DAYS } from '../../skills/savings/scripts/record.mjs';
import { DEFAULT_MINUTES, TIMEOUT_EXIT } from '../../skills/shipping/scripts/wait-checks.mjs';

// A doc writes a small count as a word, so a pin built from a constant spells it.
const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const REVIEW_THRESHOLD = [`${NUMBER_WORDS[FILE_LIMIT]} changed files`, `${LINE_LIMIT} changed lines`];

const thousands = (value) => value.toLocaleString('en-US');

const LABEL_LIMIT = 70;
const HANDSHAKE = /When a new visual surface does not name [^.]+; designing follows for presentation\./;
const HANDSHAKE_SKILLS = ['shaping', 'designing'];

const PINNED_SENTENCES = {
  'skills/shaping/SKILL.md': [
    'Count the product decisions the request leaves open: what counts as done; which data the outcome stores or shows; which of two or more architectures, dependencies, or owning layers carries it; what happens in a case the request does not mention.',
    'Zero open decisions means leave this skill and write no brief',
    'Resolve “this” from the first source containing a candidate: working-tree diff, most recent failing check, then last touched file.',
    'changes persisted-data format, a public protocol or signature, a paid external provider, or an irreversible deletion/migration',
    'Store the brief where `specs` in the session\'s `exo settings:` line says, `docs` when that line is absent, and name its location in the same message',
    '`debug` outranks this skill when existing behavior fails and the cause is unproven.',
  ],
  'skills/debug/SKILL.md': [
    'more than two changed files, a dependency, a public signature, a crossed persisted format or security boundary, or a required file outside initial inspection',
    'Outside a read-only planning turn, `debug` outranks `shaping`, `planning`, and `implementing-batch` until the cause is proven; at proof `debug` applies the predicted fix itself through Steps 4 to 7 and offers `implementing-batch` on the next-stage question for edits beyond the predicted change. Inside one, `planning` owns the turn and schedules reproduction as its first phase.',
    ...REVIEW_THRESHOLD,
  ],
  'skills/implementing-batch/SKILL.md': [
    'count these facts after initial inspection: more than two source/test/config files must change; a dependency is added; a public signature changes; a persisted format or security boundary is crossed; a required file was not covered by the inspection.',
    'After a context compaction, rebuild what has landed from the working tree diff before the next edit',
    '`debug` owns an unproven failure until its cause is established. The frontend-design skill the executing session has loaded owns visual decisions during Build; this skill retains orientation, ordering, non-visual wiring, proof, critique, and reporting.',
    ...REVIEW_THRESHOLD,
  ],
  'skills/planning/SKILL.md': [
    'Resolve a vague referent from the first non-empty source: working-tree diff, most recent failing check, then last touched file.',
    'a choice changes persisted data, a public protocol or signature, a paid provider, or an irreversible deletion or migration',
    'While a read-only planning mode is active, this skill owns the turn. The one exception is an architecture audit, which `deepen` owns while still writing the plan artifact this skill defines. `shaping` decides product and architecture, the frontend-design skill the executing session has loaded decides visual direction, `research` confirms external behavior, and each hands control back into the plan.',
    'A specialist\'s brief, audit, or selected direction is intermediate input: this skill compiles those decisions into the persisted artifact, and a specialist ending its own workflow never ends the planning turn.',
    'An unproven failure inside a planning turn makes reproduction and proof the plan\'s first phase; plan no fix past the proof point. Outside a planning turn, `debug` outranks planning until the cause is proven.',
  ],
  'skills/deepen/SKILL.md': [
    'While a read-only planning mode is active and the request is an architecture audit, this skill owns the turn and writes the plan artifact `planning` defines; every other planning turn belongs to `planning`.',
  ],
  'skills/research/SKILL.md': [
    'Never end a turn on a research pass alone.',
  ],
  'skills/designing/SKILL.md': [
    'A full or bounded redesign fails when the rendered result stays materially interchangeable with the baseline',
    'or a report that an existing surface is empty, boring, generic, flat, unfinished, or not distinctive',
    'This skill owns visual decisions only. When a `shaping`, `planning`, `implementing-batch`, or `debug` stage called it, return control for product decisions, ordering, wiring, persistence, validation, proof, and reporting. When no stage called it, execute the visual-only request and report directly.',
    'A user who leaves the look to this skill has not asked for text: rung 7 still offers.',
    'A component library in the manifest is not that evidence on its own',
  ],
  'skills/designing/references/intake.md': [
    'Name the decision an answer changes before asking anything; a question with no named decision is not asked.',
    'The exception is a read-only planning mode, which runs no `scripts/direction.mjs` call',
  ],
  'skills/designing/references/phase-detail.md': [
    '- no horizontal scroll from 360px through 1440px;',
    '- reduced-motion handling for every animation and semantic HTML beneath styling;',
    '- reflow at 320×256 CSS px with no scrolling in two dimensions, unless the content requires a two-dimensional layout for usage or meaning;',
    '- the largest element loading eagerly, every element above the fold reserving its space, and no persistent animation on a layout or paint property;',
    '- body text at least 16px, or 14px in dense data UI, with line-height at least 1.5;',
    '- contrast at least 4.5:1 for body text and 3:1 for UI chrome and text at least 24px, or at least 18.66px and bold;',
    '- targets at least 24×24 CSS px — the WCAG 2.2 AA minimum, exempt only for sufficient spacing, an equivalent control, inline text, a user-agent default, or an essential presentation — with 44×44 as the enhanced target and the default under a coarse pointer;',
    'never substitute a product-category aesthetic for missing evidence',
    'its repair is a new direction, not another polish pass, so the cycle ends there',
    'baseline before the first edit, post-build before the critique fixes, and final after them',
  ],
  'skills/designing/references/phase-direction.md': [
    'validate the set with `--check` to status ok before building any variant',
  ],
  'skills/designing/references/motion.md': [
    'only exercised is motion-verified',
  ],
  'skills/designing/references/visual-critique.md': [
    '- [ ] Body-text contrast below WCAG AA **4.5:1**.',
    '- [ ] Body text below **14px**.',
    '- [ ] Body line-height below **1.5**.',
    'adjacent type steps under a 1.25 ratio',
  ],
  'skills/designing/references/visual-direction.md': [
    '- Body ink on ground: verify a ratio of at least 4.5:1.',
    'UI chrome and text at least 24px, or 18.66px and bold, require 3:1; all smaller text requires 4.5:1.',
    'Every planned quiet region carries one named job',
  ],
  'skills/designing/references/typography.md': [
    '- **Body** — text set at 16px or larger, or 14px in dense data UI, with line-height at least 1.5, every used weight loaded, and a true italic when italic text appears.',
    'Ratio between adjacent steps: **1.25 by default**',
    'Do not name a new typeface from memory.',
  ],
  'skills/designing/builder-prompt.md': [
    '- no horizontal scroll from 360px through 1440px;',
    '- reduced-motion handling for every animation and semantic HTML beneath styling;',
    '- reflow at 320×256 CSS px with no scrolling in two dimensions, unless the content requires a two-dimensional layout for usage or meaning;',
    '- the largest element loading eagerly, every element above the fold reserving its space, and no persistent animation on a layout or paint property;',
    '- body text at least 16px, or 14px in dense data UI, with line-height at least 1.5;',
    '- contrast at least 4.5:1 for body text and 3:1 for UI chrome and text at least 24px, or at least 18.66px and bold;',
    '- targets at least 24×24 CSS px — the WCAG 2.2 AA minimum, exempt only for sufficient spacing, an equivalent control, inline text, a user-agent default, or an essential presentation — with 44×44 as the enhanced target and the default under a coarse pointer;',
    'The underdesign floor: the ground is a designed surface, not an untouched flat neutral',
  ],
  'skills/skills-tool/SKILL.md': [
    `Aim the body at ${thousands(SKILL_BODY_TOKENS.realistic)} tokens (bytes after the frontmatter / ${BYTES_PER_TOKEN}) and the description at ${DESCRIPTION_CHARS.realistic} characters; the verifier fails ${thousands(SKILL_BODY_TOKENS.ceiling)} tokens, ${thousands(INJECTED_BODY_TOKENS.ceiling)} for the injected \`${INJECTED_BODY_TOKENS.skill}\`, and ${DESCRIPTION_CHARS.ceiling} characters.`,
    `A reference holds one topic and names no other reference; over ${REFERENCE_CONTENTS_LINES} lines it opens with a contents list linking each section.`,
  ],
  'skills/skills-tool/references/description.md': [
    `Aim at ${DESCRIPTION_CHARS.realistic} characters and stay within ${DESCRIPTION_CHARS.ceiling}, so the sum across the corpus stays inside what the harness shows the model.`,
  ],
  'README.md': [
    ...REVIEW_THRESHOLD, `${NUMBER_WORDS[ATTESTATIONS_REQUIRED]} sessions`,
    `over ${DEFAULT_GUARD_LINES} lines`,
    `last ${SESSION_RETENTION_DAYS} days`,
    `${CHARACTERS_PER_TOKEN} characters per token`,
  ],
  'CONTRIBUTING.md': [
    ...REVIEW_THRESHOLD,
    `${CHARACTERS_PER_TOKEN} characters per token`,
    `lines, ${DEFAULT_GUARD_LINES} unless set`,
    `reads as ${DEFAULT_GUARD_LINES}`,
  ],
  'agents/branch-reviewer.md': [...REVIEW_THRESHOLD],
  'agents/branch-reviewer-deep.md': [...REVIEW_THRESHOLD],
  'skills/shipping/SKILL.md': [`stops after ${DEFAULT_MINUTES} minutes`, `exit ${TIMEOUT_EXIT}`],
  'skills/memory/SKILL.md': [`${NUMBER_WORDS[ATTESTATIONS_REQUIRED]} sessions`],
  'docs/skills/savings.md': [`last ${SESSION_RETENTION_DAYS} days`, `${CHARACTERS_PER_TOKEN} characters per token`],
  'skills/settings/references/setup-map.md': [`\`${DEFAULT_GUARD_LINES}\` (the default)`],
};

// A doc list that restates a data asset: every name the asset lists appears
// backticked in the doc section that states the list. The asset is read from
// the repository under check, so a self-test mutation of either side fails.
const PINNED_LISTS = [
  { file: 'skills/designing/references/visual-critique.md', section: '## Slop tropes',
    asset: 'skills/designing/assets/check-ui-findings.json', names: (json) => json.decorativeTells },
  { file: 'skills/designing/references/sketch-tab.md', section: '## The labels',
    asset: 'skills/designing/assets/sketch-tab-labels.json', names: (json) => Object.keys(json) },
  { file: 'skills/designing/references/direction-preview.md', section: '## What the chooser reads',
    asset: 'skills/designing/assets/pick-labels.json', names: (json) => Object.keys(json) },
  { file: 'skills/designing/references/phase-build.md', section: '## Judgment',
    asset: 'skills/designing/assets/check-ui-findings.json', names: (json) => json.alwaysBlocking },
];

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
    const missing = names(JSON.parse(repository.text(path.resolve(repository.root, asset))))
      .filter((name) => !body.includes(`\`${name}\``));
    if (missing.length > 0) errors.push(`${file}: ${section} lacks ${missing.join(', ')} from ${asset}`);
  }
}

// question-page.mjs owns the interview map's enums. interview-page.md keeps
// them in its prose, because the model reading it never reads the script, so
// this holds the prose to the script.
const INTERVIEW_PAGE = 'skills/shaping/references/interview-page.md';
const COUNT_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six'];

function interviewPageDrift(repository) {
  const file = path.resolve(repository.root, INTERVIEW_PAGE);
  if (!fs.existsSync(file)) return [`${INTERVIEW_PAGE}: file is missing`];
  const text = repository.text(file);
  const errors = [];
  for (const state of STATES) {
    if (!text.includes(`"state": "${state}"`)) errors.push(`${INTERVIEW_PAGE}: the example map shows no "state": "${state}"`);
  }
  const closedBy = /`closedBy` \(([^)]*)\)/.exec(text);
  const closers = closedBy === null ? [] : [...closedBy[1].matchAll(/`([^`]+)`/g)].map((match) => match[1]);
  if (closers.join(', ') !== CLOSERS.join(', ')) {
    errors.push(`${INTERVIEW_PAGE}: closedBy lists ${closers.join(', ') || 'nothing'}, the script accepts ${CLOSERS.join(', ')}`);
  }
  const optionsRange = `two to ${COUNT_WORDS[OPTIONS_MAX]} \`options\``;
  if (!text.includes(optionsRange)) errors.push(`${INTERVIEW_PAGE}: lacks "${optionsRange}", the script's OPTIONS_MAX`);
  return errors;
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

  // The handshake sentence lives in two descriptions and must read the same in both.
  const handshakes = new Map();
  for (const skill of HANDSHAKE_SKILLS) {
    const parsed = readFrontmatter(repository.lines(path.join(repository.skillsRoot, skill, 'SKILL.md')));
    const match = HANDSHAKE.exec(parsed.values.get('description') ?? '');
    if (match === null) {
      errors.push(`${skill}: description lacks the shaping/designing handshake sentence`);
    } else {
      handshakes.set(skill, match[0]);
    }
  }
  if (handshakes.size === 2 && handshakes.get('shaping') !== handshakes.get('designing')) {
    errors.push('shaping and designing handshake sentences are not byte-identical');
  }

  errors.push(...interviewPageDrift(repository));

  report.assert(
    errors.length === 0,
    'shared contracts',
    'pinned cross-file sentences, quality floors, handshake, and trigger table agree',
    errors.join('; ')
  );
}

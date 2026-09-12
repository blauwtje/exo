// Port of Test-SharedContracts (verify.ps1:536-663): the sentences two skills must
// state identically stay pinned, so a handshake cannot desync in one body alone.
// Every entry is a literal substring of the file it is keyed by, quoted from the
// PowerShell table character for character; paths are relative to the repository
// root, and one of them reaches outside it into the agent definition.

import fs from 'node:fs';
import path from 'node:path';
import { readFrontmatter } from '../frontmatter.mjs';

const LABEL_LIMIT = 70;
const HANDSHAKE = /When a new visual surface does not name [^.]+; designing follows for presentation\./;
const HANDSHAKE_SKILLS = ['shaping', 'designing'];

const PINNED_SENTENCES = {
  'skills/shaping/SKILL.md': [
    'Count these facts: more than one file; a new dependency; a changed public signature; user-visible behavior; required code not inspected during initial orientation.',
    'Resolve “this” from the first source containing a candidate: working-tree diff, most recent failing check, then last touched file.',
    'changes persisted-data format, a public protocol or signature, a paid external provider, or an irreversible deletion/migration',
    'A bare \\"fix this\\" routes by its referent: working-tree diff, then latest failing check, then last-touched file.',
    'Always write the brief to `docs/specs/<topic>.md` and name that path in the same message',
    '`debug` outranks this skill when existing behavior fails and the cause is unproven.',
  ],
  'skills/debug/SKILL.md': [
    'more than one changed file, a dependency, a public signature, user-visible behavior, or a required file outside initial inspection',
    'Outside a read-only planning turn, `debug` outranks `shaping`, `planning`, and `implementing-batch` until the cause is proven; at proof `debug` applies the predicted fix itself through Steps 4 to 7 and loads `implementing-batch` only for edits beyond the predicted change. Inside one, `planning` owns the turn and schedules reproduction as its first phase.',
  ],
  'skills/implementing-batch/SKILL.md': [
    'count these facts after initial inspection: more than one source/test/config file must change; a dependency is added; a public signature changes; user-visible behavior changes; a required file was not covered by the inspection.',
    'After a context compaction, rebuild what has landed from the working tree diff before the next edit',
    '`debug` owns an unproven failure until its cause is established. The frontend-design skill the executing session has loaded owns visual decisions during Build; this skill retains orientation, ordering, non-visual wiring, proof, critique, and reporting.',
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
    '- no horizontal scroll from 360px through 1440px;',
    '- reduced-motion handling for every animation and semantic HTML beneath styling;',
    '- reflow at 320×256 CSS px with no scrolling in two dimensions, unless the content requires a two-dimensional layout for usage or meaning;',
    '- the largest element loading eagerly, every element above the fold reserving its space, and no persistent animation on a layout or paint property;',
    'A full or bounded redesign fails when the rendered result stays materially interchangeable with the baseline',
    'or a report that an existing surface is empty, boring, generic, flat, unfinished, or not distinctive',
    '- body text at least 16px, or 14px in dense data UI, with line-height at least 1.5;',
    '- contrast at least 4.5:1 for body text and 3:1 for UI chrome and text at least 24px, or at least 18.66px and bold;',
    '- targets at least 24×24 CSS px — the WCAG 2.2 AA minimum, exempt only for sufficient spacing, an equivalent control, inline text, a user-agent default, or an essential presentation — with 44×44 as the enhanced target and the default under a coarse pointer;',
    'This skill owns visual decisions only. When a `shaping`, `planning`, `implementing-batch`, or `debug` stage called it, return control for product decisions, ordering, wiring, persistence, validation, proof, and reporting. When no stage called it, execute the visual-only request and report directly.',
    'baseline before the first edit, post-build before the critique fixes, and final after them',
    'never substitute a product-category aesthetic for missing evidence',
    'validate the set with `--check` to status ok before building any variant',
    'Name the decision an answer changes before asking anything; a question with no named decision is not asked.',
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
};

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

  report.assert(
    errors.length === 0,
    'shared contracts',
    'pinned cross-file sentences, quality floors, handshake, and trigger table agree',
    errors.join('; ')
  );
}

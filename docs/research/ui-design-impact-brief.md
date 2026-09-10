# Research brief — do these UI-design rules actually improve AI-generated design?

You are being asked to research and judge a set of prompt-level design rules. Treat the
question as open: the author wants to know **whether, how much, and in which direction**
these rules change design output — including where they do nothing or make things worse.
Do not assume the impact is positive.

## 1. What the artifact is

A "skill": a Markdown rule file injected into a coding agent's context whenever the agent
is asked to do UI work. It is not a design system, not a component library, not code. It is
process guidance plus hard constraints that steer an LLM's visual decisions before and while
it writes real frontend code into a real repository.

- `SKILL.md` (~11.5k characters) enters context when a router selects it for a request.
- Nine reference files (~45.5k characters total) are loaded **on demand at named phases**, not
  up front — `composition.md`, `typography.md`, `color.md`, `motion.md`, `craft.md`,
  `anti-slop.md`, `copywriting.md`, `code-quality.md`, `css-toolkit.md`.
- The agent runs a five-phase loop: Ground (evidence) → Diverge (three concept cards) →
  Audit (remove defaults) → Build (tokens, composition, craft, states) → Critique (render at
  390px and 1440px, find ≥3 faults, fix, render again).
- Full text of every file is in Appendix A and B. Read them before answering.

## 2. Why the question is hard

The stated goal of these rules is to stop an LLM producing "template" UI: the interchangeable
design that would fit any other product name unchanged. The rules attack that with a mix of
mechanisms that are **not equally enforceable in text**:

- Hard, checkable floors (contrast ratios, tap-target sizes, body-text size, reduced-motion).
- Bans on named patterns (purple-to-blue gradients, glassmorphism, stats heroes, emoji icons).
- Process mandates (three concept cards, a content inventory, a render-then-fix critique loop).
- Aspirational pressure ("one aesthetic risk", "atmosphere", "signature moment", the claim that
  an underdesigned result is a *defect*, not a matter of taste).

The fourth category is where the author is least sure the words do anything.

## 3. How it evolved (the changes whose impact is in question)

| Date | Change | Claim behind it |
|---|---|---|
| 2026-08-01 | Initial skill set | A routed, phase-gated design process beats ad-hoc prompting |
| 2026-08-03 | Repository audit applied | Consistency and progressive disclosure of references |
| 2026-08-06 | **Craft ceiling** — atmosphere, signature motion, ambition rules | Technically-correct-but-lifeless output is the dominant failure, so name the ceiling |
| 2026-08-06 | **Underdesign made a defect** — bounded redesign + delta evals | "Looks fine, changed nothing" must fail, not pass |
| 2026-08-07 (uncommitted) | Phase 1 evidence now reads the **repository first** for software; font-name blacklist and category-to-font recipes **deleted**; "two faces" and the 1.25 type ratio demoted from absolutes to **defaults**; motion status became three-state (exercised / code-reviewed / unjudged); a 120–200ms vs 200–400ms timing contradiction resolved | Category recipes design every product in a category alike; named-font bans age into new clichés; absolutes without conditions get followed or ignored wholesale |

The last row is the newest and least tested.

## 4. What is already measured — and what is not

The repository ships two harnesses. Be precise about what they can and cannot observe.

**`verify.ps1`** — 15 deterministic structural checks plus a 42-scenario mutation self-test.
It checks character/line budgets, cross-file pinned sentences, banned phrasing, reference-table
reachability, and that deliberately corrupting a rule is *detected*. It measures the rule set's
internal consistency. **It says nothing about design quality.**

**`evals/cases.json` + `evals/run-live.ps1`** — 29 cases run against real agent sessions on
fixture repositories, with machine-checked oracles per case:

    firstSkill, orderedRoute, references, referencePhases, maxQuestionsBeforeCode,
    editPolicy, artifactPolicy, proof, verificationCommands, breaker, freshEyes,
    requestSize, visualVerification, renderContract, pathAssertions, measurementCommand

A `renderContract` looks like this:

    { "surface": "web/dashboard.html",
      "sourceInputs": ["web/dashboard.html", "web/styles.css"],
      "viewports": [390, 1440],
      "phases": ["baseline", "post-build", "final"] }

So the evals can prove the agent **routed** to the design skill, **loaded** the right reference
at the right phase, **asked** at most N questions before coding, **rendered** at both widths at
three checkpoints, and **changed** the source between checkpoints.

**None of it judges whether the resulting design is good.** There is no perceptual metric, no
human or model rater, no A/B against a no-skill baseline, no measure of "would this be mistaken
for a template". Process compliance is fully instrumented; outcome quality is not measured at all.

## 5. What I want from you

Answer these six, in this order. Rank inside each answer; do not write an essay.

1. **Evidence base.** What published or empirical evidence exists that constraint-style prompt
   guidance of this kind measurably changes the quality of LLM-generated UI? Cite specific
   papers, benchmarks, evals, or documented industry results. Where the evidence is about
   general prompting rather than visual design, say so explicitly.
2. **Which rules are load-bearing.** Sort the rules in Appendix A/B into three buckets, with
   reasoning: (a) reliably changes model output, (b) sounds right but is unenforceable or
   unfalsifiable in text, (c) plausibly counterproductive. Name specific rules, quoted.
3. **The negative case.** Where can these rules make output *worse*? Consider at least: the
   mandate to produce three concept cards, the demand for motion on every redesign, "one
   aesthetic risk", the pattern bans (do they push every design toward the same non-default?),
   and the removal of concrete font guidance in favour of abstract trait vocabulary.
4. **Cost vs benefit.** ~11.5k characters always load once routed; up to ~45.5k more on demand.
   Estimate the plausible marginal value against that context cost and against the risk of
   instruction dilution when many rules compete for attention.
5. **Measurement design.** Propose one concrete, runnable experiment that would quantify the
   impact. Specify: conditions (with/without skill, and ablations of individual rules), the
   prompt sample and how to choose it, blinding, who or what judges, the metrics, target sample
   size, and the main confounds to control. It must work with an agent that writes real frontend
   code into a repository, and it should reuse the existing eval harness where sensible.
6. **Prior art.** What comparable published system prompts, agent skills, or design-guidance
   frameworks for LLM UI generation exist, and how does this one differ? Name them.

## 6. Rules for your answer

- Separate **documented and cited** from **your own inference**. Label every inference as such.
- If the evidence for a claim does not exist, say that plainly. Do not assemble a
  plausible-sounding case out of general reasoning and present it as findings.
- No praise, no summary of what the rules say back to me. I wrote them; I want the parts that
  do not work identified.
- Quote the exact rule text you are judging.
- Where you can, distinguish effects that would hold for any competent model from effects that
  depend on a specific model family or version.

---

# Appendix A — `SKILL.md`, verbatim

```markdown
---
name: ui-design
description: "Own visual decisions and frontend presentation for a page, view, component, or visual axis: composition, typography, color, spacing, responsive behavior, motion, interface copy, and styling architecture. Use for a new visual surface, a redesign, a surface reported as empty, boring, or generic, a new piece in an existing design, or a visual or code-quality change to existing UI. When a new visual surface does not name its displayed data, settings, or behavior, shape decides those first; ui-design follows for presentation. Do not use for typo-only copy fixes, or data flow, persistence, validation, or behavior with no visual effect."
---

# UI Design

Design as a studio lead whose work cannot be mistaken for a template: every visual choice traceable to the subject, audience, or page job, plus one aesthetic risk the brief can justify. The enemy is the transferable default — a design that could accept another product name unchanged, and its quiet twin, the timid build that breaks no rule and stirs nothing. The overcorrection is novelty that obscures content, removes states, or breaks accessibility. Subject evidence, content coverage, and the quality floor constrain the point of view.

A full or bounded redesign fails when the rendered result stays materially interchangeable with the baseline, when supporting regions stay generic while one focal point carries the design, or when a large empty area has no content, grouping, pacing, or staging job. Technical correctness and the quality floor are mandatory and never compensate for an underdesigned result. Do not default an open axis — composition, type, chromatic hierarchy, surface treatment, imagery or artifacts, motion — to absence; restraint on one axis needs a brief-side reason and expression on the others.

## Size the request

- **Full or bounded redesign:** a new page/view/identity; a request changing at least three of composition, palette, type, motion, and content hierarchy; or a report that an existing surface is empty, boring, generic, flat, unfinished, or not distinctive. Run all five phases, bounded to the named surface — the existing visual direction is evidence, not a veto.
- **New piece:** a new section, component, or view inside an existing direction. Extract existing tokens and patterns, then run Phases 1, 3, 4, and 5 for that piece.
- **Tweak:** one existing element or named visual property changes and no region is added. Make the change, audit only the touched surface, verify the floor, and stop.

The blacklist and quality floor apply at every size. Do not expand a tweak into a redesign.

## The loop

1. **Ground:** name the product, audience, single page job, content obligations, and subject evidence.
2. **Diverge:** create three directions for a full or bounded redesign; select one with countable evidence.
3. **Audit:** remove defaults before code.
4. **Build:** lock composition, tokens, craft, states, and frontend structure.
5. **Critique:** render, inspect at two widths, fix concrete faults, and render again.

## References

Load a reference only at the named phase. Do not load the set up front.

| File | Read it when |
|---|---|
| `references/anti-slop.md` | Phase 3 before code and Phase 5 before shipping. |
| `references/composition.md` | Phases 1–2 for a full or bounded redesign, Phase 4 for layout, Phase 5 for composition review. |
| `references/css-toolkit.md` | Phase 4 before CSS. |
| `references/craft.md` | Phase 4 before styling surfaces, depth, or effects; Phase 5 for the finish review. |
| `references/code-quality.md` | Phase 4 before code and Phase 5 for code review. |
| `references/color.md` | Phase 4 when expanding seed colors into tokens. |
| `references/typography.md` | Phases 2–4 when choosing or setting type. |
| `references/motion.md` | Phase 4 for a full or bounded redesign's motion plan, and before any animation at every size. |
| `references/copywriting.md` | Phase 4 before writing interface text. |

## Phase 1 — Ground

State three facts, defaulting them when absent: product in one sentence; audience and what they know on arrival; the page's single action or belief.

For a full or bounded redesign, read `references/composition.md` and write the content inventory it specifies. Collect at least three observations — for software, from the repository first: domain objects, workflows, data, user language, states, constraints, and product assets; otherwise from its materials, notation, era/place, or owned colors. Map each as `observation → visual/content behavior → repeated echo`; one mapping must affect composition/navigation and one must affect real content/data. Record the assumptions in the brief and ask one question only when a missing fact materially changes scope, behavior, or a claim; never substitute a product-category aesthetic for missing evidence.

For a bounded redesign, record the surface's baseline before any edit: hierarchy, density rhythm, dominant geometry, type contrast, surface depth, and interaction emphasis. Name which of those the complaint is about.

## Phase 2 — Diverge

For a full or bounded redesign, create three concept cards that differ on at least two axes: density, temperature, era, formality, chromatic strategy, or motion. Each card contains:

- a two-to-three-word name and one-sentence thesis;
- four-to-six color seeds and two-to-three type roles;
- desktop composition map plus mobile reading/action order;
- three subject mappings meeting the Phase 1 structural/content requirements;
- one focal point and two supporting echoes;
- one signature moment — the motion or interaction sequence the page is remembered by, named with trigger and payoff — and the atmosphere: ground treatment, one depth system, and the palette's commitment level.

Reject a card missing a content obligation or required mapping, and reject one predicting no material change from the recorded baseline on at least three axes the complaint touches — cosmetic token, radius, and palette swaps alone are not a redesign, while a data-dense module owes no motion change when motion adds nothing. Select the surviving card tracing decisions to the largest number of distinct Phase 1 observations; break a tie toward fewer unsupported content assumptions. Show the selected card as a short design brief; keep rejected cards internal unless asked.

## Phase 3 — Audit defaults

Read `references/anti-slop.md`. For content, composition, palette, type, hero, motion, and atmosphere, substitute a neighboring subject from the same category. If an axis survives unchanged and the brief did not request it, replace that axis with a decision traceable to Phase 1. Preserve explicitly requested styles.

## Phase 4 — Build

Read `references/composition.md` and implement the complete desktop/mobile map before decoration. Read `references/code-quality.md` before markup and `references/css-toolkit.md` before CSS.

Start with tokens for color, type, spacing, radius, shadow, and easing. Use `references/color.md` and `references/typography.md`; use `references/copywriting.md` for interface text. Read `references/craft.md` before styling surfaces: ground, one depth system, focal treatment, and themed browser finish. Read `references/motion.md` and build the card's signature moment — a full or bounded redesign without planned motion is unfinished unless the brief chose stillness. Keep styling in the repository's established stylesheet mechanism and reuse existing components/tokens before creating new ones.

Build one first-attention focal point and at least three supporting subject mappings. Attach proof to claims, controls to results, and annotations to their artifacts. Give every region a content job; do not use repeated containers as a substitute for relationships. When the subject's world names a technique — a canvas, an instrument, generative motion — build the technique itself, not a static imitation of it.

Quality floor:

- no horizontal scroll from 360px through 1440px;
- body text at least 16px, or 14px in dense data UI, with line-height at least 1.5;
- contrast at least 4.5:1 for body text and 3:1 for UI chrome and text at least 24px, or at least 18.66px and bold;
- visible focus for every interactive control; hover and active for pointer controls; disabled for actions that can be unavailable; loading for asynchronous actions; empty for collections; error for fallible actions and validation;
- state transitions of 120–200ms on a control's hover, focus, and active, and 200–400ms on open and close;
- targets at least 44×44px under a coarse pointer, with a 24×24px absolute minimum;
- reduced-motion handling for every animation and semantic HTML beneath styling.

## Phase 5 — Critique

Rendered review is required for a full or bounded redesign at three checkpoints, each at 390px and 1440px: baseline before the first edit, post-build before the critique fixes, and final after them. Re-reading code is not a substitute for rendered review; when no render path exists, report visual verification as blocked, name what went unchecked, and do not report the design complete. Exercise the signature moment and one interactive control; only exercised motion (`references/motion.md`) counts as verified. Review, in order: brief, baseline delta, composition, anti-slop, craft and finish, quality floor, code.

Find at least three faults that violate the brief, a content obligation, the quality floor, a mapped relationship, or repository convention; at least one must concern missing content, a broken content relationship, or a missing subject mapping, and at least one must concern craft: absent atmosphere, an unbuilt signature moment, untransitioned interactive states, or unthemed browser finish. Fix them, remove one accessory with no content job, strengthen one relationship represented in only one region, and render again. Revert either change if it hides an action, state, claim, or its evidence. Render evidence — the redesign is not complete until all six renders exist, the source and the rendered pixels changed between consecutive checkpoints, and the fixed faults include one content or relationship fault and one craft fault. That shows a post-render revision, not a proven repair; without it report visual verification as blocked.

## Judgment

- Explicit brief requirements outrank every design default and blacklist item.
- Repository framework, naming, file-layout, and component conventions outrank this skill's code defaults; they do not preserve the visual anatomy the user asked to replace.
- Scope restraint limits which surfaces, files, and behavior change; it never requires the smallest visual delta inside the approved surface.
- Accessibility and complete content/state coverage outrank visual novelty.
- An explicit brief request for showy motion or effects raises the ambition ceiling: blacklist entries and timing caps become authored defaults to exceed deliberately, while contrast, reduced-motion, and state coverage still hold.
- A planning turn takes the selected concept card into the plan and schedules Build and Critique as steps that reload this skill with that card; direction alone does not transfer the craft.
- This skill owns visual decisions only. When a `shape`, `blueprint`, `implement`, or `debug` stage called it, return control for product decisions, ordering, wiring, persistence, validation, proof, and reporting. When no stage called it, execute the visual-only request and report directly.
```

---

# Appendix B — the nine reference files, verbatim

## references/composition.md

```markdown
# Composition and Density

Compose relationships before containers. The enemy is the interchangeable vertical stack. The overcorrection is compression that crowds every viewport. Full and bounded redesigns use this process, while a tweak or new piece inherits the existing composition.

Density means content relationships per viewport, not smaller text. A sparse direction may still carry every required claim, mechanism, action, and state.

## Inventory before layout

Start with content, not sections. Write a compact inventory:

- **Objects** — the products, records, people, places, files, or events the interface is actually about.
- **Decisions** — what the audience must understand, compare, choose, or do.
- **Claims and evidence** — each promise beside its mechanism, proof, constraint, or example.
- **Actions and states** — primary and secondary actions; loading, empty, error, success, permission, and live states that can occur.
- **Subject artifacts** — real units, labels, documents, instruments, imagery, and vernacular from Phase 1.

Keep only material that supports the page's job, but do not proceed when the inventory can populate only a headline and generic benefit blurbs. A marketing page must communicate what the offer is, why it is credible, how it works or differs, and what to do next. An app view must expose current context, the primary work, controls that change it, data or objects, and states that alter the next action. These are content obligations, not prescribed sections.

## Turn subject evidence into a system

Choose at least three Phase 1 observations and write each mapping as `evidence → structural or content behavior → recurring echo`. At least one mapping must change composition or navigation, and at least one must change how real content or data is presented; palette and type alone do not qualify.

Examples of the reasoning form, not styles to copy: `repair chronology → time-anchored work surface → timestamps align filters and detail`; `tide table → time-led availability grid → the booking action uses the same time bands`.

These mappings are the subject system. If removing the logo, headline, and focal element leaves a layout that accepts a competitor unchanged, the system failed.

## Choose structures from relationships

For each content cluster, name the relationship before choosing its container:

- sequence or causality → a narrative track, timeline, or staged reveal;
- comparison → aligned rows, a matrix, or synchronized panels;
- evidence attached to a claim → an annotation, proof rail, or shared figure;
- hierarchy → index/detail, anchored rail, or nested headings without nested cards;
- changing values → a table, plot, log, meter, or subject-specific instrument;
- filters acting on results → one workbench with controls visibly attached to the result field;
- a browsable collection → a list, rail, gallery, or map chosen for how its objects differ.

Cards are for objects that can be reordered or removed without changing a neighboring object's meaning. Do not put paragraphs in separate cards when they form one argument, and do not repeat one card anatomy for three or more content types. Keep the information from a blacklisted template; replace only its generic container.

## Write a composition contract

Before code, record all five:

1. A whole-page or whole-view map for desktop, with every region labeled by its content job rather than a component name.
2. The mobile reading and action order, including what combines, becomes sticky, scrolls intentionally, or moves behind disclosure.
3. One focal point, two secondary beats, and the three or more recurring subject mappings.
4. A density rhythm: name regions showing three or more peer items, regions holding more than two prose sentences, and the one focal region.
5. The path from arrival to the page's job, naming where evidence, mechanism, and the primary action enter that path.

Reject the contract if it is a uniform vertical stack, if two consecutive regions repeat the same anatomy without a content reason, or if its labels can be replaced with “hero / features / cards / CTA” without losing meaning.

## Build density without clutter

- Each screenful advances at least two of context, evidence, mechanism, comparison, decision, or action. A focal opening may do one when the next content region appears in the same viewport or behind a labeled scroll cue.
- Give whitespace a named job: grouping, separation, pause, or staging. Collapse a gap between related items when it exceeds the gap separating their group from the next group.
- Do not repeat the same container anatomy and gap across three consecutive regions unless all three represent the same relationship.
- Layer only related information: annotation over its artifact, controls beside their results, proof beside its claim. Decorative overlap is not density.
- Finish content and state coverage before atmosphere. Texture, motion, and illustration cannot compensate for a missing proof, workflow, or decision.

## Marketing and app pressure tests

For marketing work, pair the opening thesis with a concrete artifact, mechanism, or proof; interleave claims with evidence instead of repeating benefit blocks; make the closing add decision-relevant information rather than only a larger CTA.

For app work, place the primary work surface before summaries; place controls beside what they change; show comparison, history, status, or exceptions when the requested workflow depends on them; populate every named field and design loading, empty, error, and permission states the data model can enter.

## Responsive recomposition

Mobile reduces simultaneity, not substance. Preserve every content obligation, set an explicit reading order, move secondary tools behind labeled disclosure, and keep the primary action reachable at the decision point. Tables and plots may use a labeled scroll region, pinned key columns, a changed comparison axis, or a detail view; accidental page-level horizontal scroll is never the answer.

## Pre-ship composition sweep

- [ ] Does every content obligation from the inventory appear in the rendered design?
- [ ] Outside the focal element, can you point to at least three subject mappings in structure, content, or behavior?
- [ ] Does each region add new information or a new relationship rather than paraphrase the previous one?
- [ ] Can every large area of whitespace and every repeated container name its job?
- [ ] Does mobile preserve substance and the action path rather than merely hide the difficult regions?
- [ ] After covering the brand and focal element, would a subject swap visibly break the remaining composition?
- [ ] For a bounded redesign, does the result differ from the recorded baseline on the axes the complaint named?

## Judgment

- Content obligations and action order outrank decorative composition.
- Existing layout conventions outrank a new structural model for a tweak or inserted piece.
- Mobile substance outranks desktop geometry when the two cannot be preserved together.
```

## references/typography.md

```markdown
# Typography

Cast type from the subject's observable traits and the text it must carry. The enemy is a familiar default selected without evidence. The overcorrection is novelty without language coverage, legibility, or the weights the page uses. Type carries more of a page's personality than any other single decision.

## Roles

- **Display** — the characterful face. Headlines, the hero, perhaps one pull quote. Used with restraint: when the display face is everywhere, nothing is display.
- **Body** — text set at 16px or larger, or 14px in dense data UI, with line-height at least 1.5, every used weight loaded, and a true italic when italic text appears.
- **Utility** — add only for data tables, captions, code, or spec labels; require tabular figures for changing numeric columns.

Two faces is the default. Add a third when data, code, or labels need tabular figures or a character grid absent from both. Use one family as a stated concept, with display and body separated by at least 200 weight units or different width-axis values.

## Source by character, not by list

Any fixed list of "distinctive fonts" becomes next year's cliché, and a category-to-face recipe designs every product in a category alike. Never cast from a shortlist; cast from a description:

1. **Write the type spec.** From Phase 1, name three to five observable traits: serif construction, width, stroke contrast, terminal shape, x-height, and era or tradition. Tie each trait to one subject observation.
2. **Translate the traits into search vocabulary** — construction, width, contrast, terminal shape, x-height, era — using the subject's own words rather than its product category.
3. **Search live catalogs** — Google Fonts and other variable-font libraries — using that vocabulary, and judge candidates against the spec, not against familiarity.
4. **Vet the winner:** variable axes or at least four real weights? True italics, not slants? Tabular and lining figures if it will set data? Language coverage for the audience? Does it hold up at text sizes, or is it display-only?

Reject any face reached for by familiarity instead of from the spec, including whatever the last several projects used.

## Pairing

Pair faces that differ on at least one named construction, width, contrast, or weight axis and share at least one named era, proportion, or skeleton trait.

- Contrast **construction**, share **era or proportions** — a didone display over a transitional text face; wood-type display over an old-style text face.
- Contrast **weight and width**, share **skeleton** — a compressed heavy grotesque over its normal-width sibling, or one variable family doing both.
- A serif-and-sans **superfamily** supplies two constructions cut from one skeleton.
- A utility face differs from body in construction or width and supplies tabular figures when it sets changing numeric columns.

Set the display over two sentences of body at rendered sizes. Reject the pair unless it meets both named-axis rules above.

## Scale

- Ratio between adjacent steps: **1.25 by default**; below it hierarchy flattens (`anti-slop.md`), so a tighter step needs a stated density or existing-scale reason. By density:
  - 1.25 — dense product UI, dashboards
  - 1.333–1.414 — marketing pages, moderate drama
  - 1.5–1.618+ — editorial and expressive work
- Build the scale as fluid `clamp()` tokens (`css-toolkit.md`); afterward use only the tokens.
- **Weights are steps too.** Separate hierarchy roles by at least 200 weight units (400 → 600). With a variable font, store each used value in a role token.
- **Width is a hierarchy tool.** A condensed cut for display against normal-width body creates contrast without a second family.
- **Oversized display** applies when the selected concept card names the headline as its focal point: 10–16vw via `clamp()`, tracking −1% to −3%, leading 0.95–1.05.

## Micro rules — the craft floor

- Measure: 45–75ch for body; set `max-inline-size` in `ch`.
- Leading inverse to size: body 1.5–1.7; display 0.95–1.15.
- Tracking: tighten large display slightly (`letter-spacing: -0.01em` to `-0.02em`); loosen ALL-CAPS and small labels (`+0.03em` to `+0.08em`); never letterspace lowercase body text.
- ALL-CAPS for short labels only, never sentences.
- `font-variant-numeric: tabular-nums` in any column, timer, or stat that changes.
- `font-optical-sizing: auto` whenever an `opsz` axis exists.
- Real quotation marks and apostrophes (“ ” ’), real dashes. No faux bold or faux italic — if the browser synthesizes a missing weight or slant, load the real one or restructure.
- Enable hyphenation for justified text. Use ragged-right unless the brief explicitly requests justification.

## Variable fonts

Use one variable file per family when the chosen face provides it. Use registered properties for `wght`, `wdth`, and `opsz`; set `font-optical-sizing: auto` when an optical-size axis exists. Use raw `font-variation-settings` only for custom axes.

## Judgment

- Language coverage, legibility at the rendered size, and real weights/italics outrank novelty.
- Existing brand type and project loading conventions outrank this reference's sourcing defaults.
- The Phase 1 type spec outranks font familiarity or blacklist avoidance alone.
```

## references/color.md

```markdown
# Color — from Seeds to System

Grow a small set of color seeds into named interface roles without losing their origin. The enemy is default gray plus stock green and red filling every unnamed role. The overcorrection is forcing every role through one seed until contrast and state meaning collapse. A concept card names 4–6 seeds; a build adds the roles below rather than targeting a token count. The mechanics (`oklch()`, `color-mix()`, relative color, `light-dark()`) live in `css-toolkit.md`; this is what to decide.

## Roles before values

Name tokens by role, never by hue — `--accent`, not `--orange`; the value may change, the role won't. The working minimum:

- `--ground`, `--surface` — the page and raised planes
- `--ink`, `--ink-muted` — two text roles; add another only for inverse text on a filled surface or an existing project role
- `--border` — hairlines, derived, never hand-picked
- `--accent`, `--accent-hover`, `--tint` — the identity color and its companions
- state colors — only for states the UI actually has

Everything beyond the seeds is **derived, not invented** (`color-mix()`, relative color): derivation is what keeps fifteen values reading as one family.

## Neutrals carry the direction

Most of the page is neutral — which is exactly where generic creeps in. Two rules:

- **Never pure gray.** Give ground and ink a trace of the direction's hue: chroma 0.005–0.03, hue borrowed from the accent or its neighborhood. Warm paper versus cool slate is a concept decision, not a default.
- **Two anchors, one ramp.** Pick ground and ink deliberately; everything between them — surface, border, muted ink — is mixed from the anchors (`color-mix(in oklch, …)`). A neutral that wasn't mixed from the anchors doesn't belong in the file.

## Commitment

Name how much of the surface the palette claims; the concept card states the level:

- **Restrained** — neutral grounds, accent at the focal point and named signals only.
- **Committed** — one saturated color carries 30–60% of the surface; neutrals are recut against it and every contrast pairing is re-verified.
- **Drenched** — the surface is the color; ink, borders, and states are recut for the drenched ground.

Escalate past restrained when the brief asks for boldness or the subject's world is chromatic; a committed or drenched page re-runs the full contrast check against its new grounds.

## State colors are natives, not imports

Bootstrap green, red, and amber dropped into a considered palette break it instantly. Keep the hue *convention* — reddish reads destructive, greenish reads fine — but recut the color for this direction:

1. Choose the hue inside the conventional band (danger ≈ 20–35, warning ≈ 70–95, success ≈ 140–160 in oklch).
2. Match lightness and chroma to the accent's, so the state color sits in the same family — a muted terracotta danger on a warm editorial page; a sharp phosphor success on acid dark.
3. Derive its companions (`-tint` for backgrounds, a text-safe cut) exactly as for the accent.

Add a state color only for a state the implemented interface can enter.

## The dark scheme is a second design

Build a dark scheme only when the brief requests one or the existing product already exposes one. If either fact is true:

- **Recompose; don't invert.** Dark ground keeps the hue trace at L 0.14–0.22—never `#000`. Give raised surfaces a higher lightness than ground, lower their chroma from the light scheme, and re-pick accents, inks, and borders rather than flipping them.
- Shadows stop working on dark; hierarchy moves to borders and surface steps (surface a step lighter than ground).
- **Fork in one place.** `color-scheme: light dark` on `:root`, every forked token declared once with `light-dark()`. Component rules never mention a scheme — if a component knows about dark mode, the tokens have failed.
- Contrast does not survive the flip: re-verify every text and chrome pairing on the dark side.

## Contrast by construction

Choose token lightness against explicit contrast ratios before component styling:

- Body ink on ground: verify a ratio of at least 4.5:1.
- Name each accent use. UI chrome and text at least 24px, or 18.66px and bold, require 3:1; all smaller text requires 4.5:1. When one accent value misses either threshold, derive separate display and interactive values at the same hue with different lightness.
- Muted ink is the usual casualty: "muted" never drops below AA.

## Spend chroma like boldness

SKILL.md's focal-hierarchy rule applies chromatically. Let the accent mark the focal element and secondary signals named in the content inventory. Do not give every region the same accent chroma and area; recurring hue may echo the subject system through derived values.

## Judgment

- Explicit brand and brief colors outrank derived defaults, subject to the contrast floor.
- Verified contrast outranks visual similarity to the seed palette.
- Existing project tokens outrank a parallel token system; extend them by role.
```

## references/craft.md

```markdown
# Surface Craft — Depth, Atmosphere, Finish

Give the surface a physicality chosen from the concept: ground, light, texture, and finished edges. The enemy is the unstyled void — a flat default ground, one borrowed shadow, and browser chrome nobody themed. The overcorrection is stacked atmosphere that buries content or mixes effect systems until none reads.

## Ground

The page background is a designed surface, never an untouched default. Choose one ambient treatment:

- a hue-traced ground built from the palette anchors (`color.md`);
- a gradient field with a named light source and direction — two or three stops inside one hue family;
- a subject-derived texture: grain, paper, graph grid, blueprint, fabric, or another Phase 1 material.

One ambient layer at most, behind all content. Dosage over drama: noise at 2–5% opacity, pattern contrast low enough to disappear under text, and body-text contrast still at the floor on top of it.

## One depth system

Pick exactly one and encode it in tokens; mixing two is the ghost-card tell (a hairline border under a wide soft shadow):

- **Flat + borders** — hierarchy from hairlines and surface steps.
- **Soft ambient light** — layered diffuse shadows, one implied light direction, tokened elevation steps.
- **Hard offset** — solid shadows and thick strokes, only when the direction is genuinely neobrutalist.
- **Layered translucency** — blur and glass, only where a layer sits over real changing content.

## Focal treatment

Concentrate craft where attention should land. The focal point may earn what the blacklist denies everywhere else — a glow where the subject emits light, glass over its layered content, one gradient with named hue logic — provided a Phase 1 mapping and a named job back the effect. Reinforce it with scale contrast, chroma concentration, or typographic mass. Atmosphere spread evenly is atmosphere wasted.

## Finish — browser surfaces

Theme what ships with defaults; this is the cheapest signal a page was built rather than assembled:

- `::selection` colored from the palette;
- `:focus-visible` rings recolored and offset in the direction's accent, never the browser default;
- `caret-color` and `accent-color` in forms;
- `scrollbar-color` on panels that scroll inside the layout;
- link `text-decoration-thickness` and `text-underline-offset` set deliberately;
- `font-variant-numeric: tabular-nums` in changing columns (`typography.md`).

## Detail vocabulary

- Borders are craft: inset hairlines, double rules, corner ticks — drawn from the subject's material world, applied by one consistent rule.
- One radius scale, one icon stroke width, one hairline weight, all from tokens.
- A designed ground turns deliberate whitespace into staging instead of absence.

## Judgment

- Content coverage and the contrast floor outrank every atmospheric ambition.
- One system per axis — depth, texture, radius — outranks variety.
- Focal concentration outranks even distribution of effects.
- Existing repository tokens and conventions outrank these defaults.
```

## references/motion.md

```markdown
# Motion

Choreograph motion as a concept decision, not a garnish. The enemy is the motionless build: every rule satisfied, nothing alive. The overcorrection is motion scattered across every element; scattered effects read as generated where one authored moment reads as designed.

## Motion thesis

For a full or bounded redesign, write one sentence before any animation: what moves, on what trigger, and what it communicates about the subject. A generic fade-and-rise, hover lift, or scroll reveal is not a thesis; derive it from a Phase 1 observation exactly as composition and palette derive.

A full or bounded redesign ships by default:

- one signature sequence realizing the thesis — an entrance, scroll, or interaction moment;
- a staged entrance for the opening viewport: focal element first, supporting groups staggered, running once and settling fully visible — its reveal mechanism chosen from Materials, because one uniform fade-and-rise across every group is the template tell;
- transitions on every interactive control's hover, focus, active, and open states.

A brief that chooses stillness removes the first two; the third is the polish floor at every size.

## Job gate

Name exactly one job for each animation:

1. **Continuity:** show where an element came from or went.
2. **Feedback:** confirm an action or state change.
3. **Orientation:** direct attention to the element that changed.
4. **Signature:** the one orchestrated sequence tied to the thesis.

Cut an animation with no listed job. One signature sequence per page/view; other motion serves continuity, feedback, or orientation. For every planned sequence record: trigger → target/state → job → timing token → repository mechanism → reduced-motion result → status. A static render cannot clear a sequence. Report each sequence **exercised** when driven in a render, **code-reviewed** when only its code path was read against the thesis, **unjudged** when neither; only exercised is motion-verified.

## Materials

Choose the mechanism from the meaning, not from habit:

- continuity across states or navigation → view transitions, FLIP, shared elements;
- depth and focus → blur, backdrop-filter, layered shadow;
- reveal → clip-path, mask, staged opacity;
- energy or a live instrument → canvas or generative motion, only when the subject's world names the technique — then build the technique itself, not a static imitation.

Transform and opacity are the workhorses; blur, clip-path, mask, and shadow join when they stay smooth on target devices.

## Timing

- Hover, toggle, press: 120–200ms.
- Panel, dropdown, card transition: 200–400ms.
- Signature sequence or authored focal entrance: 400–800ms.
- Sibling stagger: 30–80ms, with the complete sequence no longer than 800ms.
- Exits are shorter than entries; functional motion decelerates — `cubic-bezier(0.16, 1, 0.3, 1)` is the default ease-out. The signature sequence earns its own curve from the subject's physics; the default curve on the one authored moment reads as borrowed.
- Bounce or elastic easing needs a brief whose world is literally springy; it never lands on functional controls.

Store durations and curves in tokens. Transition named properties, never `all`.

## Scroll and view transitions

Use CSS scroll timelines when the browser matrix supports them and the page remains complete without them. Scroll-driven storytelling suits narrative pages: pin at most one or two sections, scrub tied to real content progression, reveals running once and settling fully visible. Parallax moves non-text imagery by at most 10% of scroll distance; a brief demanding more names the cost. Never steer wheel or scroll position.

Use view transitions only for elements persisting across a state or navigation change, naming only those elements. Use `@starting-style` plus discrete transitions for supported dialog, popover, or display-state entry. Final open and closed states work without animation.

## Reduced motion

Author movement inside `prefers-reduced-motion: no-preference`. Under `reduce`, replace movement with instant state or opacity change; preserve content and feedback. Apply the rule to CSS animation, scroll timelines, view transitions, and autoplaying media.

## Libraries

Prefer the platform. Use a repository's existing animation library idiomatically. Adding a library is justified for orchestration, physics, or scrubbed timelines the supported CSS matrix cannot express — never for one fade.

## Escalation

An explicit brief request for showy motion raises the ceiling: the caps above become authored defaults to exceed deliberately. Reduced-motion coverage, interaction feedback, and content visibility never lapse.

## Judgment

- Reduced-motion preference and interaction feedback outrank the thesis.
- One authored signature outranks scattered micro-effects.
- A brief's requested intensity outranks this file's caps; the accessibility floor outranks the brief.
- Existing repository motion tokens and browser targets outrank values in this reference.
```

## references/anti-slop.md

```markdown
# Anti-Slop — the Default Blacklist

Choose every pattern from subject evidence or an explicit brief. The enemy is a default that appears regardless of subject and is used because it was nearest. The overcorrection is banning a listed pattern even when the brief explicitly asks for it. The entries below are defaults, not absolute prohibitions.

Use this file twice: before code, revise each unrequested match in Part 1; before shipping, run Part 2 against the rendered page and code. Every removed default needs replacement parity: the affected content must keep or gain hierarchy, specificity, atmosphere, relationship clarity, or interaction feedback, and deletion alone never passes.

## Part 1 — The blacklist

### Color and effects

- [ ] **Purple-to-blue gradient** on buttons, headline text, or background orbs.
- [ ] **Decorative glassmorphism** — frosted cards whose translucency neither reveals changing content beneath nor separates navigation, dialog, or popover from that content.
- [ ] **Neon glow borders** and glowing accent edges on dark UI.
- [ ] **Thick colored accent border on one side of a card** — the `border-left: 4px solid` callout reflex.
- [ ] **Hairline border + wide diffuse shadow on the same card** — two depth systems stacked because neither was chosen.
- [ ] **Border-radius above 16px on cards.** A pill control whose width exceeds its height is not a card.

### Typography

- [ ] **A face chosen by familiarity rather than by a Phase 1 type trait.** Sourcing: `typography.md`.
- [ ] **Italic-serif hero headline** — italics standing in for feeling.
- [ ] **A single font family throughout**, unless the concept explicitly chooses it and display/body roles differ by at least 200 weight units or use different width-axis values.
- [ ] **Flat hierarchy** — adjacent type steps under a 1.25 ratio; headings that are merely bold body.
- [ ] **Reflexive eyebrow labels** — tiny tracked-out uppercase label above every heading, whether or not it classifies anything.
- [ ] **Icon-in-rounded-square above every card heading** — the feature-grid tell.

### Icons and imagery

- [ ] **Emoji as interface icons** — 🚀 ✨ 💡 🎯 in feature cards, list bullets, buttons, or headings.
- [ ] **Mixed icon sets** — outline beside filled, more than one stroke-width token, or more than one view-box grid.
- [ ] **Gray placeholder boxes** where imagery was promised. Render one Phase 1 subject artifact with a repository asset, SVG, CSS, or real data; otherwise omit the image region.
- [ ] **Gradient-blob or abstract-shape "illustrations"** replacing a subject artifact named in Phase 1.

### Layout

When an item matches, keep the content and choose a relationship-led structure from `composition.md`; deleting the region is not a pass.

- [ ] **The stats hero** — big number, small label, three supporting stats, gradient accent. The template answer to "make it look impressive."
- [ ] **Endless identical card grids** — icon + heading + two lines, ×6 or ×9. When every card shares one anatomy, the grid is wallpaper.
- [ ] **Nested cards** — cards inside cards, borders inside borders.
- [ ] **Monotonous uniform spacing** — the same gap between everything, so nothing groups with anything.
- [ ] **Decorative numbered markers** (01 / 02 / 03) on content that is not actually a sequence.
- [ ] **A recognizable whole-page look applied regardless of subject** — if the Part 2 substitution test does not break it, the look is a costume rather than a design.

### Motion

- [ ] **Pulsing status dots** as decoration — "live" badges that are not live.
- [ ] **Bounce or elastic easing** on interface elements.
- [ ] **Auto-scrolling marquees** — logo walls, testimonial tickers.
- [ ] **Scale or rotate on image hover.**
- [ ] **Scattered micro-effects** — a dozen small hovers and fades instead of one orchestrated moment.

## Part 2 — Pre-ship sweep

Walk the rendered page first, then the code.

**On the page:**

- [ ] Mentally cover the focal element: do at least three supporting subject decisions and every supporting region's content job remain?
- [ ] The substitution test, one last time: swap in a competitor's name and subject. Does the design resist, or fit them just as well?
- [ ] Read every heading and button aloud — any phrase from the banned cadence in `copywriting.md`?
- [ ] Any Part 1 item present that the brief did not explicitly request?

**In the code — grep for the tells:**

- [ ] `linear-gradient` — any purple-or-violet-to-blue stops on UI surfaces?
- [ ] `backdrop-filter: blur` — does each use reveal changing content beneath a navigation, dialog, or popover layer?
- [ ] `border-radius` — cards above 16px?
- [ ] `font-family` — any face the Phase 1 type spec does not name?
- [ ] `animation` / `transition` — overshoot `cubic-bezier` (bounce/elastic), infinite pulse loops, marquee keyframes?
- [ ] An eyebrow-label component repeated above headings it does not classify?
- [ ] Emoji characters in the markup doing icon or bullet duty?

## Part 3 — Hard floor

Unlike Parts 1–2 these are defects, not styles. If a brief explicitly demands one (a dense terminal UI at 13px), flag the accessibility cost to the user before complying; never ship one silently:

- [ ] Body-text contrast below WCAG AA **4.5:1**.
- [ ] Body text below **14px**.
- [ ] Body line-height below **1.5**.
- [ ] Justified text without hyphenation enabled.

## Judgment

- Explicit brief choices outrank the blacklist; the hard floor still requires the accessibility cost to be disclosed.
- Subject evidence outranks familiarity, and content preservation outranks deleting a blacklisted container.
```

## references/copywriting.md

```markdown
# Copywriting

Write interface copy that names the current state, available action, and next consequence. The enemy is placeholder text and transferable slogans. The overcorrection is shortening labels until state, consequence, or recovery disappears. Use real copy for the real subject from the first draft; lorem ipsum sits on the banned list in `css-toolkit.md`.

## Name from the user's side

Name things by what the person controls and recognizes, never by how the system is built. Someone manages *notifications*, not *webhook configuration*; they see *drafts*, not *unpublished content objects*. Describe what a thing does in plain terms instead of selling it — specific beats clever, every time:

- "Search across all 40 fields" beats "Powerful search."
- "Exports to CSV in one click" beats "Seamless integrations."

## Build substance, not slogans

For every marketing claim, include at least one mechanism, constraint, example, or proof nearby; do not fill sections by paraphrasing the same benefit. For app work, populate every named field with a normal value, each documented boundary, and a value that triggers each represented error state. Source values from the repository or subject materials; label invented values as assumptions, and never invent regulated, safety, customer, or performance claims.

Each section must add at least one fact, mechanism, constraint, example, proof, action, or state absent from the preceding section.

## Verbs, voice, vocabulary

- Active voice, present tense. The interface does things now.
- A control names its outcome: **"Save changes"**, **"Create project"** — never "Submit", "Go", or "OK" where an outcome exists to name.
- One verb per action, product-wide, held through the whole flow: the button says "Publish", the progress state says "Publishing…", the toast says "Published". Never "Post" in one place and "Share" in another for the same act. Consistent vocabulary is how people learn their way around; every synonym is a signpost pointing two directions.
- Sentence case for labels and headings, unless the type direction states otherwise.
- No filler: "please note that", "simply", "just", "in order to" — delete on sight.

## Errors explain; empty states invite

An error answers three questions, in the interface's voice, without blame and without apology theater:

1. What happened — precisely; never "Something went wrong" when you know what did.
2. Why — only when the why changes what to do.
3. What to do next — include the recovery action in the same error surface when the interface exposes one.

> ✗ "Oops! Something went wrong."
> ✓ "Couldn't save — you're offline. Changes are kept on this device and will sync when you reconnect."

An empty state is the interface's first impression, not an absence. Say what will live here and hand over the first action:

> ✗ "No projects found."
> ✓ "Projects you create will appear here." + [New project]

## One job per element

A label labels. An example demonstrates. A tooltip clarifies, and nothing essential lives only in a tooltip. Nothing quietly does double duty. Length discipline: buttons one to three words; toasts one clause; tooltips one sentence; error body two sentences at most.

## Banned — the AI cadence

These patterns mark machine-written copy as surely as purple gradients mark machine design:

- **Em-dash overuse.** The signature tic of generated prose. More than one per screen of interface copy: rewrite with periods or commas.
- **The inflation lexicon:** streamline, empower, supercharge, world-class, seamless, effortless, unleash, elevate, revolutionize, next-generation, game-changing, "at scale" (unless literally about scaling). Replace each with the specific fact it was inflating.
- **Manufactured contrast:** "It's not just X — it's Y." "X isn't Y. It's Z." One instance is rhetoric; as a house style it is autocomplete.
- **Reflexive triplets:** "Fast. Simple. Powerful." Keep only when each word names a different observable product behavior; otherwise replace the triplet with those behaviors.
- **Rhetorical-question openers** ("Tired of messy spreadsheets?") and **audience hedging** ("Whether you're a startup or an enterprise…").

The test for every line, headlines and buttons included: does it contain a fact? A claim without a noun a competitor couldn't equally use is decoration — and worse, familiar decoration.

## Register

Use established brand vocabulary when it exists. Otherwise choose one register for the flow and keep its verbs, contractions, and formality consistent: "All clear. Nothing needs you." and "0 open incidents" do not belong in the same flow.

## Judgment

- Verified product facts and regulated wording outrank tone and conversion language.
- User vocabulary and established product terms outrank synonyms introduced for variety.
- A specific action or state outranks a slogan when one element cannot carry both.
```

## references/code-quality.md

```markdown
# Code Quality — Architecture and Economy

Make the implementation preserve the design without hiding its structure. The enemy is under-engineering: inline styling, one file owning unrelated regions, or the same declaration block copied three times. The overcorrection is an abstraction with one caller or indirection that removes no repetition. Prefer the form with fewer statements when observable behavior and repository conventions stay unchanged.

One rule outranks everything below: in an existing codebase, the project's own conventions win — naming, file layout, styling approach, framework idiom. These rules are the default for greenfield work and for projects with no discernible convention.

## Where code lives

- Styling lives in a dedicated stylesheet — never in `style=""` attributes, never as `<style>` fragments accreted through the markup. Inline `style` is permitted for exactly one thing: values that are genuinely per-instance data, passed as custom properties (`style="--delay: 120ms"`, `style="--cover: url(…)"`).
- **Single-file deliverables** (artifacts, single HTML demos) change nothing structurally: one organized `<style>` block in `<head>` *is* the stylesheet, with the same internal order — and still zero inline `style=""` attributes.
- Stylesheet order mirrors the `@layer` order from `css-toolkit.md`: reset → tokens → base → layout → components → utilities. Within the components layer, rules follow page order, so the stylesheet reads top-to-bottom like the page.
- Behavior lives in script files (or one `<script>` block in single-file mode). No inline `onclick=""` handlers; wire events with `addEventListener` or the framework's idiom.
- In frameworks, use the stylesheet mechanism already present in the repository: CSS Modules, scoped styles, a co-located `.css`, or the framework's equivalent. In a Tailwind project, extract a component when the same class string occurs three times; do not introduce `@apply` when the repository has none.

## Economy — fewer statements for the same behavior

Every line must earn its place. Length is a cost paid by every future reader; verbosity is not thoroughness.

- **Ask the platform first.** Before writing a block, check what already exists: CSS over JS (`:has()`, scroll-driven animations, `@starting-style`, scroll-state queries — see `css-toolkit.md`); semantic HTML over div-plus-ARIA reconstruction; native `<dialog>`, `popover`, and `<details>` over hand-rolled widgets. Ten lines of JS replicating a native feature is ten lines of debt.
- **Derive, don't repeat.** Values come from tokens (`color-mix()`, relative color — `css-toolkit.md`). Repeated markup is generated from data—a framework `map`, a loop, a template—not pasted. Declarations shared by three selectors move to one common class.
- **Markup is lean.** No wrapper div whose only job is holding a class when the semantic element underneath can carry the style. No class on an element that no rule selects.
- **No dead weight.** No empty rules, no commented-out blocks, no utilities "for later", no imported library for what ten lines of platform code do.
- **Modern shorthand is the default idiom**: `inset` over four offsets, `place-items`/`place-content`, `margin-block`/`padding-inline`, `gap` instead of per-child margins, `aspect-ratio` instead of padding hacks.

## The abstraction bar

Reusability is a cost paid up front for a payoff that must actually arrive. Set the bar explicitly:

- Extract a component, utility, or partial when the pattern exists **three times**. Below that, write it in place. A single-use abstraction is indirection, not architecture; inline it.
- Prefer parameterizing what exists — props, custom properties, a modifier class — over creating a near-duplicate sibling.
- **Reuse before creating.** Check the project's existing components, utilities, and tokens before adding new ones; a second button component is a bug, not a contribution.
- Split a component when it owns two behaviors invoked independently or two regions reused independently.

## Readability

- Names describe role, not appearance: `.card-price`, not `.text-blue-bold`. One naming convention per project, applied without exception.
- Specificity stays flat: one class per element as the default, overrides resolved by `@layer` order — never selector weight, never `!important` (the mechanism is in `css-toolkit.md`; the failure mode is in SKILL.md Phase 4).
- Comments state only what the code cannot: a magic number's origin, a browser workaround, a constraint. Never narrate what the code visibly does.

## Pre-ship code sweep

Run in Phase 5, alongside the anti-slop sweep. Grep for the tells:

- [ ] `style=` — any inline style attribute that isn't a per-instance custom property?
- [ ] `onclick=` / `onload=` — any inline event handlers?
- [ ] Raw hex or ad-hoc px mid-file that should be a token?
- [ ] The same three-plus declarations duplicated across selectors?
- [ ] A wrapper element whose only job is holding a class?
- [ ] JS doing what CSS now does natively — scroll effects, entry transitions, sticky-header state?
- [ ] An abstraction with exactly one call site?
- [ ] Dead code — unused selectors, empty rules, commented-out blocks?

## Judgment

- Existing repository conventions outrank greenfield defaults in this reference.
- The shortest form that preserves behavior and project idiom outranks both reuse speculation and line-count reduction.
```

## references/css-toolkit.md

```markdown
# Modern CSS toolkit

Use platform features to make the concept structural instead of decorative. The enemy is dated code that recreates shipped CSS in JavaScript. The overcorrection is using a feature outside the project's browser matrix without a complete fallback.

## Compatibility gate

Read the project's browser targets before choosing syntax. Use an existing build/transpile policy when present. A feature outside that matrix must sit behind `@supports` or degrade to a complete, usable layout; no enhancement may carry required content or the only available action. When no target matrix exists — greenfield work or a single-file demo — assume current evergreen browsers and keep the reduced-motion and degradation paths.

## Tokens

Define palette, type, spacing, radius, shadow, and easing tokens before component rules. Use `oklch()` for authored colors when supported by the target matrix; derive related colors with `color-mix()` or relative color syntax rather than unrelated literals. Use `light-dark()` only with `color-scheme` configured.

```css
:root {
  color-scheme: light dark;
  --ink: oklch(24% 0.02 260);
  --ground: oklch(97% 0.01 95);
  --accent: oklch(63% 0.19 40);
  --tint: color-mix(in oklch, var(--accent) 12%, var(--ground));
}
```

Raw hex and ad-hoc pixel values do not appear inside component rules. Borders and one-pixel device alignments may use pixels.

## Responsive type and layout

- Define fluid type tokens with `clamp()`, using 360px for the minimum calculation and 1280–1440px for the maximum.
- Use container queries for components reused in more than one layout; use media queries for viewport-wide composition changes.
- Use grid or flex for layout and subgrid when child rows must align across siblings.
- Use logical properties for flow-relative spacing and inset; use physical properties only for a screen-anchored edge.
- Use `aspect-ratio`, `gap`, `place-*`, and `inset` instead of padding-ratio, child-margin, or four-offset workarounds.

## Selectors and cascade

- Use `:has()` when parent or sibling state already exists in the DOM; do not add JavaScript only to mirror that state.
- Nest selectors at most three levels. Deeper nesting creates specificity coupling.
- Declare cascade order once with `@layer reset, tokens, base, layout, components, utilities`.
- Keep one class per element as the default. Resolve overrides through layer order, not selector weight or `!important`.
- Use `text-wrap: balance` for short headings and `text-wrap: pretty` for prose when the target matrix supports them.

## Enhanced transitions

Read `motion.md` before adding motion. Scroll timelines, view transitions, and `@starting-style` are enhancements: guard them for the target matrix, keep final content visible without them, and provide the reduced-motion path. Use the View Transition API for state or navigation continuity only when both states remain usable without it.

## Native controls

Prefer semantic HTML and shipped controls—`dialog`, `popover`, `details`, native form states—over div-plus-ARIA reconstructions. Style their focus, open/closed, invalid, and disabled states; native does not mean unstyled.

## Banned patterns

- Float layout except text wrapping around an image.
- Pixel-only type scales.
- JavaScript wheel hijacking or scroll steering.
- A scroll library for an effect expressible by a supported CSS timeline.
- `transition: all`; name each transitioned property.
- Inline event handlers or CSS declarations, except per-instance custom-property data allowed by `code-quality.md`.
- Placeholder copy.

## Judgment

- The repository browser matrix and existing stack outrank feature novelty.
- Complete content, actions, and reduced-motion behavior outrank enhancement fidelity.
- Native platform behavior outranks custom code when both satisfy the same requirement.
```


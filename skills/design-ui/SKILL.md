---
name: design-ui
description: Use when a page or component's look or copy changes, or it looks empty, boring or generic. Not for a typo, a non-visual change, or a request that leaves data or behavior open (spec).
---

# design-ui

Build the page as a real product someone could ship tomorrow, designed from the world of the people who use it. The enemy is a style picked with no link to the subject, which gives one house look across unrelated briefs. The overcorrection is a page that passes every lint line, or paints one themed motif on every surface, yet nobody would choose it. The subject's own world makes a page specific, and a critique by fresh eyes makes it good.

Plan on about 900 s at effort high. Spend it on the direction, the imagery and the critique round, since those decide the result; a fast build that skips them looks finished and generic.

## Kind

Decide first whether the page is an app or a document, because the two fit the screen differently.

- App → launcher, feed, inbox, dashboard, editor, store, any tool someone uses daily.
- App at 1440 → it fits the 1440x900 window like a desktop app: chrome bar, panes, lists that scroll inside their pane.
- App at 390 → a phone app with a top bar and a bottom tab bar switching views.
- Document → landing, marketing, docs and article pages, laid out per `references/marketing.md`. One message per screen, each shown through a product artifact rather than copy on an empty ground, and each explicit ask high on the page where readers still are.
- App hierarchy → the largest type and image go to the primary object (the game, the post, the tracked number), not a greeting or slogan. Chrome stays smaller and quieter than content, so the eye lands on what the person came for.

## Direction

A named direction wins: the request's own look, the repo's tokens, a plan's `## Visual direction` or a task's `Contract:`. Build against it and pick none. Otherwise derive the direction from the subject, in visible text before any code:

1. Name the category default: the look most products in this category ship (white cards and a blue primary for a dashboard, a food photo hero on cream for a recipe site), then its opposite. The default is where the page drifts unless something specific pulls it away.
2. List 5-7 artifacts and traditions from the audience's own life: objects they handle, places they go, crafts and print they know. A cycling club suggests race numbers, jersey stripes and route cards; a tea shop suggests tins, paper wrappers and ledger books.
3. Run `node "${CLAUDE_SKILL_DIR}/scripts/deal.mjs"` and add its two seeds to the list. They are nudges from outside the subject, useful when your own list feels thin; a seed with no link to the audience loses to one that has it.
4. Pick the candidate that fits this audience best and is furthest from the category default.
5. Write the contract in a few lines: thesis (what the page should feel like and why), world and materials, palette (dominant color, sharp accent), type roles (display face, text face). Add the signature object that recurs across the page and the per-item imagery idea.
6. Add density, tight or airy, for this audience: a trading desk runs tight, a recipe journal can breathe. Airy is where pages drift, so pick it on purpose.
7. Add a region inventory: every region of the first viewport at 1440 (each pane, rail, band and the hero's two halves) with the content it holds. A region with nothing to list is a dead region; give it a module that belongs there or remove it, before any code.

Read `references/slop.md` while choosing; it names the generic looks and copy tells to steer away from. Ask the user only when the page cannot be built without the answer; else decide and list the decision in the report.

Steer away from the exo house look, since it is what this skill produced across unrelated briefs: pale ground, serif display with sans body and mono labels, hairline rules, small stamped props. The model's own defaults are listed in `references/slop.md`. Banning a look alone swaps it for another fixed look, or leaves the space empty, so put working detail where the banned detail stood:

- Mono labels and stamped props → real labels set in the item's own color, counters, status chips, timestamps and progress.
- Hairline rules → the world's own edges and dividers (a track line, a dock stripe, a tape edge), or a change of ground value.
- Eyebrows and section numbers → annotations on the art that name what it shows (a callout on a chart point, a label on a map pin).

## Craft

Open each reference when you reach its part of the build; each holds the reasons and the depth this file leaves out.

- Type → `references/typography.md`: a display face for titles and the primary object, a quiet text face for everything else, local font files allowed.
- Color → `references/color.md`: one dominant color with a sharp accent, value range, materials and depth.
- Layout → `references/layout.md`: app and document structure, filling the frame, hierarchy, spacing, density.
- Marketing → `references/marketing.md`: product in the hero, an artifact per section, band rhythm.
- Motion → `references/motion.md`: one orchestrated load, state transitions, reduced motion.

## Imagery

Imagery is where generic pages show most, so give it real work. Each item (game, post, product, person) gets its own picture of its own subject: the lighthouse for the sea game, the loaf for the baking post, the mountain pass for the ride. A single template recolored per item reads as a placeholder.

- Method → an art module of its own (SVG or canvas) with a per-item motif table and hand-written path data where a shape needs it. Size it to the job; a rich module of a few hundred lines is normal.
- Scale → art fills whole tiles, banners and cover areas edge to edge, and is the largest element of a feed post that has one.
- Detail → grows with area. A field over about 300px square gets planes (fore, mid, back), one light direction, a texture in the world's terms and small secondary marks; a large flat shape on a flat fill reads as a placeholder.
- Product as imagery → on marketing pages a real-fidelity UI fragment in HTML and CSS, full of specific data, counts as imagery and usually beats an illustrated metaphor.
- Subject → the world from the contract shows in the materials and the signature object; the items' own art carries their variety.

## Build

- Stack → the repo's stack and tokens; with none, plain HTML, CSS and JS. Split CSS, art, data and script into files when it helps; write as many files and Writes as the page needs.
- Restyle → keep all content, links and working behavior; change only presentation.
- Content → the request's facts and names as given; specific made-up data where it gives none; no invented proof (reviews, logos, metrics).
- Product data → rows, logs, builds, schedules, invoices and statuses inside the product can be invented freely and generously, since they are product, not proof; a list holds enough items to fill its pane plus one scroll.
- Repeated items → one data array plus one render function, so content lands in the DOM before the first paint.
- Finish → a full, working product surface, not a hero with stubs: tabs and views switch, toggles toggle, progress moves, each requested state (loading, empty, error, success) has a styled place.
- Controls → hover, `:focus-visible`, active and disabled styles; themed `::selection`, `caret-color` and scrollbar.
- Semantics → real `button`, `a` and `label`, heading order, alt text, `lang`, viewport meta, touch targets about 44px at 390.
- Network → no CDN or network fonts unless the request allows them; a failed request shows as a `CONSOLE` line.
- Copy → passes the swap test in `references/slop.md`.

## Check

The floors catch what is broken; the critique catches what is weak. A page with zero lint lines can still be generic, so the critique is part of done.

1. Floors → `node "${CLAUDE_SKILL_DIR}/scripts/look.mjs" <file-or-url> --out <dir>`, with `--app` for an app, one `--expect "<text>"` per explicit ask, and one `--state "<name>=<js>"` per state worth seeing (a second tab, an open sheet, a filled form, an error, keyboard focus). The JS runs in the page and puts it in that state, for example `document.querySelector('#tab-friends').click()`.
2. Fix each printed line: `CONTRAST` (the ratio decides, not the eye), `CLIP`, `OVERLAP`, `FONTS`, `FIT`, `NAV`, `OVERFLOW`, `CONSOLE`, `MISSING`, `BELOW`, `STATE`. A hidden view counts for an ask only when its tab or control is visible and its content is in the DOM.
3. Critique → dispatch one fresh delegate whose prompt opens with `exo-kind: review` as critic, briefed per `references/critic.md`. It sees the shots, the request and the contract, never your code or reasoning, so it judges what a user sees.
4. Fix round → act on its findings in one round of edits, then rerun look with `--no-shots` to confirm the floors still hold. A `rebuild` verdict on one area means rebuilding that area in this round.

## Report

- Contents → the contract lines, files changed, shot paths, the final `LOOK fail=<n>` line, the critic's verdict and what you changed for it, each explicit ask with a pass mark, any decision taken in place of a question.
- Length → under 15 lines, no praise of the result.

## References

| File | Read it when |
|---|---|
| `references/slop.md` | While choosing the direction, and before writing copy. |
| `references/typography.md` | Before setting type. |
| `references/color.md` | Before choosing the palette and surfaces. |
| `references/layout.md` | Before laying out the page. |
| `references/marketing.md` | Before laying out any document page (landing, marketing, docs). |
| `references/motion.md` | Before adding motion or state transitions. |
| `references/critic.md` | At the critique step, to brief the critic. |

## Judgment

- The request's explicit asks outrank taste, the direction and the steering in the references.
- A real product look outranks a striking concept: a page that could not ship as this product tomorrow is not done.

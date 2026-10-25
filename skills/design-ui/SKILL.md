---
name: design-ui
description: Use when a page or component's look or copy changes, or it looks empty, boring or generic. Not for a typo, a non-visual change, or a request that leaves data or behavior open (spec).
---

# design-ui

Build the page as a real, shipped product from a named studio, not a concept board. The enemy is a magazine or poster look on an app and one house look across unrelated briefs. The overcorrection is boldness spent on a headline or one themed hero instead of the full product surface.

## Kind

- App, not document → launcher, feed, inbox, dashboard, editor, store, any tool someone uses daily; landing, marketing, docs and article pages are documents.
- App at 1440 → page fits the 1440x900 window like a desktop app: chrome bar, panes, lists scroll inside their pane, no document scroll.
- App at 390 → a phone app: top bar, bottom tab bar switching views, primary content starting in the top half of the first screen; desktop panes become tabs or sheets, not one long stack.
- App type → largest type goes to the primary object (game title, post text, the number being tracked), not a greeting or slogan; display at most 3x body in chrome.
- Document → one idea per screen, a first viewport that shows the product or its subject at large scale, every ask in the first 3000 px.

## Direction

- Question → ask only when the page cannot be built without the answer; else decide and list the decision in the report.
- House look → not the exo default: pale ground, serif display with sans body and mono labels, hairline rules, small stamped props.
- Deal → one Bash: `node "${CLAUDE_SKILL_DIR}/scripts/deal.mjs"; cat "${CLAUDE_SKILL_DIR}/references/slop.md"`.
- No deal → skip it unless the request leaves the look open; a named look or the repo's tokens win.
- Pick → the first dealt direction that fits audience and subject, not a comparison of all 3; adapt its hues to the subject, keep its type and shape rules.
- Contract → at most 5 lines as visible text: kind, direction, color system, type roles, signature device; the page Write is the next call, with no draft of code, copy or data before it.

## Color

- System, not accent → chrome color, one primary action color, and per-item or per-type fills over large areas (whole cards, tiles, art, bars).
- Coverage → color fields cover at least 30% of the first screen; below it, at least 2 saturated zones stay visible.
- Value range → deep, mid and light steps in every view, so a thumbnail of the page still shows zones, not one muddy or pale field.
- Text on color → a tinted dark or light from the same hue, not gray; each text/ground token pair carries its computed ratio in a CSS comment.
- Small accent text → its own darker token, apart from the fill.

## Type

- Families → at most 2, one is often best for an app; mono only for real code, paths or keys.
- Faces → characterful system or local stacks from the deal; request allows network fonts → one web display face. Never Inter, Roboto, Arial, system-ui or a serif as an app's display face.
- Weights → confident spread (400 and 700-800), tabular numerals on prices, counts, times and progress.
- Banned in app UI → two-tone headline words, framed title plaques, italic asides, tracked caps eyebrows over headings, 01/02/03 numbering.
- Body → 15-17px in app chrome, post or article text 17-20px; line length at most 75ch.
- Controls → `button, input, select, textarea { font: inherit }`, so no browser default face leaks in.

## Imagery

- Variety → every item (game, post, product, person) gets its own hue and scene; no two images in one view share palette and composition.
- Method → one parametric SVG or CSS art function fed a per-item palette and motif, not one hand-drawn image copied with a tint.
- Method size → art function at most 40 lines composing 2-4 shapes from the item's seed and palette; no per-item motif table, no hand-written path data.
- Scale → art fills whole tiles, banners and cover areas edge to edge; no small decorative props standing in for imagery.
- Feed or post list → each post with an image gets full-width art at 16:9 or taller as the post's largest element, not a thumbnail beside text.
- Density → 24-32px gaps between feed items, cards and tiles; posts as open bands on the ground, not bordered boxes packed edge to edge.
- Subject → shows in the variety of items and their art, not as one themed motif painted on every surface.

## Build

- Stack → repo's existing stack and tokens; none → plain HTML, CSS and JS; no CDN or network fonts unless the request allows them.
- Restyle → keep all content, links and working behavior; change only presentation.
- Content → the request's facts and names as given; made-up but specific data where it gives none; no invented proof (reviews, logos, metrics) beyond the brief.
- Repeated items → one JS data array plus one render function, not hand-written markup per item; content then lands in the DOM before the first paint.
- File, no repo stack → one `index.html` with inline `<style>` and `<script>`, made by one Write under 35 KB; fixes by Edit, not a rewrite.
- Data → at most 10 items per list; the art function makes their variety, not more items or longer copy.
- Shape → one radius, border and shadow rule across every card and control, taken from the direction.
- Browser surfaces → themed `::selection`, `caret-color`, scrollbar, `:focus-visible` ring (2px, offset 2px, 3:1).
- Layout → spacing from a 4/8 scale; works at 1440, 768 and 390 with no horizontal scroll; long names and numbers truncate with an ellipsis, not collide.
- States → every control has hover, `:focus-visible`, active and disabled; each requested state (loading, empty, error, success, progress) has a visible, styled place.
- Interaction → every control the request names works: tabs and views switch, toggles toggle, progress moves.
- Motion → hover and press 100-150ms, view or tab change 150-250ms with `transform`/`opacity` only, one signature motion tied to the direction; content visible at opacity 1 without waiting for scroll; a `prefers-reduced-motion` block cuts all of it.
- Semantics → real `button`, `a`, `label`, heading order, alt text, `lang`, viewport meta; touch targets at least 40px at 390.
- Copy → passes the swap test in `references/slop.md`.

## Check

- Look run → once after the build: `node "${CLAUDE_SKILL_DIR}/scripts/look.mjs" <file-or-url> --out <dir>`, plus `--app` for an app and one `--expect "<text>"` per explicit ask.
- Hidden view (tab, sheet) → counts for an ask only when its tab or control is visible and its content is in the DOM, not only in script.
- Look output → its lines are the whole check: no other browser tool, screenshot script or reading of look.mjs source.
- Shots → Read the full-page `<dir>/1440.png` and `<dir>/390.png` once; fix the top 3 defects by severity (broken, unreadable, house look or generic, polish) together with the printed lines, in one round of Edits.
- Recheck → only when look printed a fail line: rerun with `--no-shots`, fix what remains, then stop; at most 2 look runs and one shot read.
- Lines → `CONTRAST`, `CLIP`, `OVERLAP`, `FONTS`, `FIT`, `NAV`, `OVERFLOW`, `CONSOLE`, `MISSING`, `BELOW` each get fixed; the `CONTRAST` ratio decides, not the eye.

## Report

- Contents → the contract lines, files changed, shot paths, final `LOOK fail=<n>` line, each explicit ask with a pass mark, any decision taken in place of a question.
- Length → under 15 lines; no praise of the result.

## References

| File | Read it when |
|---|---|
| `references/slop.md` | Once, in the deal Bash. |

## Judgment

- The request's explicit asks outrank taste, the deal and the bans.
- A real product look outranks a striking concept: if a page could not ship as this product tomorrow, it is not done.

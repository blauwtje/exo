# Typography

Type carries most of a page's voice, so choose faces for the direction's world, then give each a narrow job.

## Roles

- Display face → titles and the primary object only (game titles, post headlines, the big number). Used everywhere, a loud face flattens hierarchy: when every button, label and tab shouts, nothing does.
- Text face → body, labels, buttons, metadata. Quiet and readable at small sizes, so the display face has room to speak.
- Pairing → contrast in structure, such as a condensed or wide display over a humanist text face, or a slab over a grotesque. Two similar sans faces read as a mistake.
- One family → fine when the family has a wide weight range and the direction is restrained; then hierarchy comes from weight and size alone.
- Mono → only for real code, paths, keys and IDs; mono labels as decoration are part of the house look.

## Sources

Pick the face first, then find where it comes from, in this order:

1. The repo's own fonts and tokens.
2. A font file already on disk, copied next to the page so it works offline, and loaded with `@font-face` and `font-display: swap`. Look in the repo, in `node_modules/@fontsource/*`, and in the system font folders (`/System/Library/Fonts`, `/Library/Fonts`, `~/Library/Fonts` on macOS; `/usr/share/fonts` on Linux; `fc-list : family file` where fontconfig exists).
3. A network font, only when the request allows network use.
4. A system stack, as the fallback inside each `font-family`, not as the design choice.

A characterful face the system lacks beats a system stack the direction did not ask for. Steer away from Inter, Roboto, Arial and `system-ui` as display faces, and from Avenir Next as the default answer to every brief; each has become a house face.

## Scale

- Documents → strong jumps: display at 3x body or more, weights at the extremes (300 against 800), so the hierarchy reads at a glance. A hero display may run 96-160px, since big tight type fills a hero with intent.
- Tracking by size → -0.03em at 56px and up, -0.015em at 32-48px, +0.015em on 10-12px captions; large type set loose looks unfinished and tiny type set tight clogs.
- Heading line height → 1.1-1.2, since body leading on a large heading opens gaps between its lines.
- App chrome → modest display, at most about 3x body; the primary object gets the largest type, chrome labels stay small.
- Body → 15-17px in app chrome, 17-20px for posts and articles; body text lines at most about 75ch, while the column around them, art and data may run wider.
- Numbers → `font-variant-numeric: tabular-nums` on prices, counts, times and progress, so columns align and values do not jitter.
- Controls → `button, input, select, textarea { font: inherit }`, so no browser default face leaks in.
- Families → at most 2 per page; look.mjs prints `FONTS` past that.

## Patterns to replace

Each reads as machine-made in app UI; use the alternative instead.

- Two-tone headline (one word in the accent) → one color; emphasis by weight or size.
- Tracked caps eyebrow over every heading → let the heading stand, or use a real category label set in the item's own color.
- `01 / 02 / 03` numbering on sections → real labels or none; a numbered sequence the request asks for (steps of a process) stays numbered.
- Italic serif asides and pull quotes in an app → plain text in the text face, or a real quote set with its person's name, role and company where the request supplies one.
- Framed title plaques → the title set directly on the art or ground.

# Reference input and numbered regions

Read this when the request supplies a screenshot, a recording or a URL to match or to learn from.

## Intake

- Image: read the file.
- Recording: pull one frame per state worth matching with ffmpeg.
- URL: shoot it with `scripts/look.mjs <url> --out <dir>` and use those shots as the reference.
- Write down, per region, what to match: layout, density, type, color, spacing.
- Match structure and feel, and copy no brand assets or text that the request lacks.
- An unreadable reference (no browser, blocked URL, bad file) → say so in the report and build from the request alone.

## Regions

1. After the build, shoot the result with `look.mjs` and list its regions in reading order, top left first: header, hero, a card list, a filter bar. Number them from 1; aim for 3 to 9.
2. Map each region to the component file that renders it:
   `node "${CLAUDE_SKILL_DIR}/scripts/regions.mjs" --root <source dir> --region "<name 1>" --region "<name 2>"`
3. Fix every `MISSING` and `AMBIGUOUS` line before reporting: rename the region to the component's name, or split the file so one region has one file. A region with no file of its own is a region to extract first.

## Report

- One layout variant by default. Build a second only when the request asks for one, and put it in its own file next to the first.
- Show the result shot beside the reference shot, then a short difference note: what matches, what differs, and why.
- Give the numbered list as `<n> <name>: <file>`, exactly as `regions.mjs` printed it.
- A later "region 3 tighter" edits only region 3's file. Read that file, change it, rerun `look.mjs`, and touch no other region's file; when the change needs a shared token or file, say which one and why before editing it.

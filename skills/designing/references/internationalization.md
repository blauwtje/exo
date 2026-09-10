# Internationalization

Design for the sentence you did not write. The enemy is the layout that only holds English at the length the designer typed it: a fixed-width button, a hard-coded date, a name interpolated into a sentence that reorders itself in Hebrew. The overcorrection is a design flattened into shapeless boxes on the theory that something somewhere might be longer.

Load this file when the product ships more than one language, when the repository already carries translation machinery, or when the audience from Phase 1 reads a right-to-left or non-Latin script. A single-locale prototype owes the logical properties and nothing else.

## Direction is markup

- **"Never use CSS to apply the base direction"** ([w3.org/International/questions/qa-html-dir](https://www.w3.org/International/questions/qa-html-dir), read 2026-09-07). `dir="rtl"` goes on the `html` element; `dir` on a block element only where the base direction genuinely *changes*. Verify: grep the stylesheet for `direction:` and `unicode-bidi:` used to set page direction, and expect zero hits.
- **Runtime content declares its own direction.** Set `dir="auto"` on inputs, search fields, and inserted text (same page). The mechanism has a sharp edge: the browser looks at "the first strongly typed character", so a value opening with a digit, an `@`, or punctuation inherits the parent direction instead. Verify: paste an Arabic string into every field and check the caret and alignment flip per field.
- **Every interpolated value is isolated.** A user name, filename, address, or count dropped into a sentence needs `<bdi>` or an inline element with `dir="auto"`; without it the surrounding text reorders around it ([w3.org/International/articles/inline-bidi-markup](https://www.w3.org/International/articles/inline-bidi-markup/), read 2026-09-07). `<bdo>` is for a deliberate override only. Verify: render one Hebrew and one Arabic display name plus a trailing number in the same template and check each number stays beside its own noun.
- **Language is declared too.** A language attribute on `html`, and another on any element wrapping content in a different language; never a `Content-Language` meta ([w3.org/International/questions/qa-html-language-declarations](https://www.w3.org/International/questions/qa-html-language-declarations), read 2026-09-07). This is also what selects the right font, hyphenation, and quotation marks.

## Mirroring is a decision per element

Render the surface at `dir="rtl"` and screenshot-diff it against the left-to-right render: **every difference must be a decision somebody made.** Layout, reading order, and paired punctuation mirror — the W3C's own rule is to read a mirrored character's name as "opening" and "closing" rather than left and right ([tech-bidi Best Practice 13](https://www.w3.org/International/geo/html-tech/tech-bidi.html), W3C Working Draft 2007-06-06, non-consensus). Elements whose meaning is anchored outside the text — a photograph, a logo, a chart's time axis, a code sample, a physical-world icon with a handedness — are decided case by case and recorded, not flipped by default. No first-party source consulted here publishes a definitive never-mirror list, so treat each as a judgement with a reason, not a rule to cite.

## The residual breakage

Logical properties cover inline and block sizing, `margin-*`, `padding-*`, `border-*` including the four `border-start-start-radius`-style corners, `inset-*`, and the logical mappings for `float` and `clear` ([MDN CSS logical properties, last modified 2025-11-18](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_logical_properties_and_values)). They do **not** cover `box-shadow`, `transform` and `translate`, `background-position`, or gradient directions. Those four are where an otherwise clean RTL render breaks. Verify: grep for `left`, `right`, `translateX`, `box-shadow`, and directional gradients, and require each hit to be either justified or paired with a `[dir="rtl"]` rule.

## Length is a design constraint

Short strings grow the most. Expected translated length relative to the English source, from IBM's global-design guidelines as reproduced by the W3C ([w3.org/International/articles/article-text-size](https://www.w3.org/International/articles/article-text-size), read 2026-09-07):

| Source length (characters) | Expected translated length |
|---|---|
| up to 10 | 200–300% |
| 11–20 | 180–200% |
| 21–30 | 160–180% |
| 31–50 | 140–160% |
| 51–70 | 151–170% |
| over 70 | around 130% |

A one-word button label is therefore designed for two to three times its width. This rules out fixed-width single-line containers for short labels: tabs, chips, segmented controls, and buttons size to content or wrap. Verify: apply a 2× pseudo-localisation to every string under 20 characters and diff for clipping, wrapping, and overflow. This is the same failure surface as the text-spacing check in `accessibility.md`; run them together.

## Formats come from the platform

`en-US` writes `26,254.39` and `5/24/2012`; `de-DE` writes `26.254,39` and `24.5.2012` ([MDN `Intl`, last modified 2025-09-24](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl)). No hard-coded separators, no `MM/DD/YYYY`, no `"s"` appended for a plural, no `"a, b and c"` assembled by hand, no hand-written "3 days ago". Use `Intl.NumberFormat`, `Intl.DateTimeFormat`, `Intl.PluralRules`, `Intl.RelativeTimeFormat`, and `Intl.ListFormat`. Verify: rerun the surface under `de-DE`, `ar-EG`, and `pl-PL` — the last has plural categories beyond one and other — and check separators, date order, and list joins all changed.

Type carries its own obligation: the face chosen in `typography.md` covers the audience's scripts, and `font-variant-numeric: tabular-nums` still applies to changing figures in every locale.

## Judgment

- A rendered RTL diff outranks a stylesheet read; a locale rerun outranks a translation file.
- Content preservation outranks geometry: a label that grows moves the layout rather than truncating.
- Existing repository i18n machinery, message formats, and locale conventions outrank these defaults.
- Where a mirroring choice has no first-party rule, record the reason rather than citing one.

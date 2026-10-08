# Internationalization

Apply only when the product ships more than one language, carries translation machinery, or serves a right-to-left or non-Latin script. The enemy is the layout that only holds English at the length the designer typed it: a fixed-width button, a hard-coded date, a name interpolated into a sentence that reorders itself in Hebrew. The overcorrection is a design flattened into shapeless boxes on the theory that something somewhere might be longer.

## Formats come from the platform

- Hard-code none of: separators, `MM/DD/YYYY`, `"s"` appended for a plural, `"a, b and c"` assembled by hand, hand-written "3 days ago".
- Use `Intl.NumberFormat`, `Intl.DateTimeFormat`, `Intl.PluralRules`, `Intl.RelativeTimeFormat`, `Intl.ListFormat`.
- Verify: rerun the surface under `de-DE`, `ar-EG` and `pl-PL` (plural categories beyond one and other); separators, date order and list joins all changed.

## Length is a design constraint

- Tabs, chips, segmented controls, buttons → size to content or wrap, never a fixed-width single-line container; a one-word label grows to two to three times its English width.
- Verify: 2× pseudo-localisation on every string under 20 characters, diff for clipping, wrapping, overflow.
- Run that check together with the text-spacing check in the `accessibility` reference; same failure surface.

Expected translated length relative to the English source:

| Source length (characters) | Expected translated length |
|---|---|
| up to 10 | 200–300% |
| 11–20 | 180–200% |
| 21–30 | 160–180% |
| 31–50 | 140–160% |
| 51–70 | 151–170% |
| over 70 | around 130% |

## Direction is markup

- Base direction → `dir="rtl"` on the `html` element, never CSS `direction` or `unicode-bidi`.
- `dir` on a block element → only where base direction changes.
- Verify: grep the stylesheet for `direction:` and `unicode-bidi:` setting page direction; expect zero hits.
- Inputs, search fields, inserted text → `dir="auto"`.
- Value opening with a digit, `@` or punctuation → inherits parent direction; browser reads the first strongly typed character.
- Verify: paste an Arabic string into every field; caret and alignment flip per field.
- Every interpolated value (user name, filename, address, count) → isolate with `<bdi>` or an inline element with `dir="auto"`, else surrounding text reorders around it.
- `<bdo>` → only for a deliberate override.
- Verify: render one Hebrew and one Arabic display name plus a trailing number in the same template; each number stays beside its own noun.
- Language → attribute on `html` plus one on any element wrapping content in another language; never a `Content-Language` meta.

## The residual breakage

- `box-shadow`, `transform` and `translate`, `background-position`, gradient direction → each gets a `[dir="rtl"]` rule or recorded reason; logical properties don't cover them and an otherwise clean RTL render breaks there.
- Verify: grep for `left`, `right`, `translateX`, `box-shadow` and directional gradients; each hit justified or paired with a `[dir="rtl"]` rule.
- Logical properties for: inline and block sizing, `margin-*`, `padding-*`, `border-*` including the four `border-start-start-radius`-style corners, `inset-*`, `float` and `clear`.

## Mirroring is a decision per element

- Render the surface at `dir="rtl"`, screenshot-diff against the left-to-right render; **every difference = a decision somebody made**.
- Mirror layout, reading order, paired punctuation; read a mirrored character's name as "opening"/"closing", not left/right.
- Element whose meaning is anchored outside the text (photograph, logo, chart time axis, code sample, physical-world icon with a handedness) → decide case by case and record; never flip by default.

## Judgment

- Rendered RTL diff outranks a stylesheet read; locale rerun outranks a translation file.
- Content preservation outranks geometry: a growing label moves the layout, not truncates.
- Existing repository i18n machinery, message formats, locale conventions outrank these defaults.
- Mirroring choice with no first-party rule → record the reason, don't cite one.

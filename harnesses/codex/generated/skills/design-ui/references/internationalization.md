# Internationalization

Apply this file only when the product ships more than one language, carries translation machinery, or serves a right-to-left or non-Latin script. The enemy is the layout that only holds English at the length the designer typed it: a fixed-width button, a hard-coded date, a name interpolated into a sentence that reorders itself in Hebrew. The overcorrection is a design flattened into shapeless boxes on the theory that something somewhere might be longer.

## Formats come from the platform

- Hard-code no separators, no `MM/DD/YYYY`, no `"s"` appended for a plural, no `"a, b and c"` assembled by hand and no hand-written "3 days ago".
- Use `Intl.NumberFormat`, `Intl.DateTimeFormat`, `Intl.PluralRules`, `Intl.RelativeTimeFormat` and `Intl.ListFormat`.
- Verify: rerun the surface under `de-DE`, `ar-EG` and `pl-PL`, the last having plural categories beyond one and other, and check separators, date order and list joins all changed.

## Length is a design constraint

- Size tabs, chips, segmented controls and buttons to content or let them wrap, never a fixed-width single-line container, because a one-word label grows to two to three times its English width.
- Verify: apply a 2× pseudo-localisation to every string under 20 characters and diff for clipping, wrapping and overflow.
- Run that check together with the text-spacing check in the `accessibility` reference, which shares its failure surface.

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

- Set the base direction with `dir="rtl"` on the `html` element, never with CSS `direction` or `unicode-bidi`.
- Put `dir` on a block element only where the base direction changes.
- Verify: grep the stylesheet for `direction:` and `unicode-bidi:` used to set page direction, and expect zero hits.
- Set `dir="auto"` on inputs, search fields and inserted text.
- Expect a value opening with a digit, an `@` or punctuation to inherit the parent direction, because the browser reads the first strongly typed character.
- Verify: paste an Arabic string into every field and check the caret and alignment flip per field.
- Isolate every interpolated value, such as a user name, filename, address or count, with `<bdi>` or an inline element with `dir="auto"`, or the surrounding text reorders around it.
- Use `<bdo>` only for a deliberate override.
- Verify: render one Hebrew and one Arabic display name plus a trailing number in the same template and check each number stays beside its own noun.
- Declare the language with an attribute on `html` and another on any element wrapping content in a different language, never a `Content-Language` meta.

## The residual breakage

- Give each `box-shadow`, `transform` and `translate`, `background-position` and gradient direction a `[dir="rtl"]` rule or a recorded reason, because logical properties do not cover them and an otherwise clean RTL render breaks there.
- Verify: grep for `left`, `right`, `translateX`, `box-shadow` and directional gradients, and require each hit to be justified or paired with a `[dir="rtl"]` rule.
- Use logical properties for inline and block sizing, `margin-*`, `padding-*`, `border-*` including the four `border-start-start-radius`-style corners, `inset-*`, and `float` and `clear`.

## Mirroring is a decision per element

- Render the surface at `dir="rtl"`, screenshot-diff it against the left-to-right render, and make **every difference a decision somebody made**.
- Mirror layout, reading order and paired punctuation, reading a mirrored character's name as "opening" and "closing" rather than left and right.
- Decide case by case and record, never flip by default, an element whose meaning is anchored outside the text: a photograph, a logo, a chart's time axis, a code sample or a physical-world icon with a handedness.

## Judgment

- A rendered RTL diff outranks a stylesheet read; a locale rerun outranks a translation file.
- Content preservation outranks geometry: a label that grows moves the layout rather than truncating.
- Existing repository i18n machinery, message formats, and locale conventions outrank these defaults.
- Where a mirroring choice has no first-party rule, record the reason rather than citing one.

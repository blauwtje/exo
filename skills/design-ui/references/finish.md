# Finish checklist

## States

Draw each that applies, styled, not browser default:
- Controls → default, hover, focus-visible (2px ring, offset 2px, 3:1 against the background), active, disabled (reduced contrast, `cursor: not-allowed`, still legible).
- Data views → loading (skeleton), empty (message plus next action), error (what failed plus retry), success.
- Forms → field error text beside the field in text, not color alone; `aria-invalid`; success confirmation.
- Tooltips and hovers → also reachable by keyboard focus.

## Floors

- Contrast → body and small text 4.5:1, large text and UI parts 3:1; check muted text, placeholder, and text on the accent.
- Accent as small text (under 18px) → its own 4.5:1 on that background; darken the accent text token apart from the button fill.
- Outline or transparent-fill text → none, decorative too; look.mjs scores it 1.0.
- Contrast proof → look.mjs `CONTRAST` lines, not a judged screenshot; a ratio of 4.46 fails 4.5.
- Type → body at least 16px, line height 1.5-1.7 for body, 1.05-1.2 for display; line length at most 75ch.
- Targets → at least 40px tall on touch widths.
- Semantics → real `button`, `a`, `label`, `table`, heading order; alt text; `lang`; viewport meta.
- Layout → no horizontal scroll at 390; long text and long numbers do not break the layout.

## Pre-flight

1. Every requirement anchor ticked against the page; look.mjs prints no `MISSING` or `BELOW`.
2. Shots 1440 and 390 viewed; nothing clipped, overlapping or empty; look.mjs ends `LOOK fail=0`.
3. No `CONSOLE` or `OVERFLOW` line left.
4. Reduced-motion block present.
5. Stock-phrase grep is 0; hero headline passes swap-the-name.
6. Fix order → broken, unreadable, generic, polish.

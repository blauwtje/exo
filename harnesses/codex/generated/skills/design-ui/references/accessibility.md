# Accessibility

Prove behavior, not compliance. The enemy is the page that passes the automated scan and fails a person: zero violations, no keyboard path, no announcement, a dialog the scanner never opened.

Criteria enumerated in a report, none built → defect.

## What automation proves, and what it never does

- Empty `violations` array → proves nothing; `incomplete` results were aborted and need manual checks.
- Report the scanned state, never the page: scanner skips inactive menus and modal windows.
- Open the dialog, menu and disclosure, then scan again.
- Off by default: WCAG 2.2 rules, AAA rules, experimental rules, deprecated rules. Enable them deliberately or say which did not run.
- `resultTypes` = speed option, not filter: omitted types cap at one node each, so truncated report undercounts.
- Never write "accessible" from a scan; write "no automated violations in the states scanned" and name manual checks done or not done.
- Scan detects: missing alt, missing control names, ARIA validity, duplicate ids, document language, heading and landmark structure, resolvable text contrast, frame titles, list markup.
- Unresolvable background → contrast returned as needs-review.
- Scan cannot judge: whether a label is the right label, whether a criterion's exception applies, anything behind a state it never entered.

## The criteria that carry numbers

- **1.4.12 Text Spacing**: content survives line-height 1.5× font size, paragraph spacing 2×, letter-spacing 0.12×, word-spacing 0.16×.
- Text spacing → judge the overridden state, not the authored one.
- Verify text spacing: inject the four values as a user stylesheet, diff geometry for clipping and overlap.
- Fixed-height chips, buttons, single-line labels → fail text spacing first.
- **1.4.10 Reflow**: `phase-detail` reference `## The build floor` owns the 320×256 floor; run that check as well as the 360px one.
- **1.3.4 Orientation**: no lock to one display orientation unless that orientation is essential.
- Verify orientation: detect orientation-locking CSS, render both ways.
- **4.1.3 Status Messages**: status message (success, waiting, progress, error) reaches assistive technology via `role="status"`, `role="alert"` or `aria-live` without moving focus.
- Verify status message: assert role or `aria-live` on the node, and focus did not move.
- **2.4.11 Focus Not Obscured (Minimum)**: focused element never entirely hidden by author-created content.
- 2.4.11 failing edges: sticky header, bottom action bar, cookie banner, floating chat launcher.
- Verify 2.4.11: tab to the control directly beneath each fixed edge, assert its focus ring is on screen.
- Fix 2.4.11 → `scroll-margin` on the focusable, sized to the sticky region; never disable smooth scrolling.
- **2.5.7 Dragging Movements**: every drag function has a single-pointer alternative needing no drag, unless dragging is essential.
- Reorder list, slider, kanban column, map pan, resize handle → each owes a tap or click path: arrows, move-to menu, numeric field or buttons.

## Keyboard contracts

Source: W3C ARIA Authoring Practices Guide (APG).

- **Focus never falls to the body.** After close, delete or route change → focus moves somewhere deliberate and visible.
- **Modal dialog**: open → focus moves inside; close → focus returns to the invoking element.
- **Modal dialog**: Tab wraps last tabbable → first, Shift+Tab reverse; Escape closes.
- **Modal dialog**: `role="dialog"`, `aria-modal="true"`, name from `aria-labelledby` on a visible title.
- **Modal dialog** verify: tab past the end, assert wrap; press Escape, assert focus on trigger.
- **Combobox**: DOM focus stays on the combobox while a listbox, grid or tree descendant is active via `aria-activedescendant`; only a dialog popup takes real focus.
- **Combobox**: in tab sequence; Down Arrow opens popup or moves into it; Escape dismisses and returns focus; Enter accepts focused option.
- **Combobox**: `role="combobox"`, `aria-expanded`, `aria-controls`, `aria-haspopup` matching popup type, `aria-autocomplete` of `none`, `list` or `both`, `aria-selected` on the selection.
- **Combobox** verify: open, press Down twice, assert `document.activeElement` still the input and `aria-activedescendant` names the selected option.
- **Menu button**: Enter and Space open the menu and put real DOM focus on the first item, unlike combobox.
- **Menu button**: `aria-haspopup` of `menu`; `aria-expanded` while open.
- **Tabs**: whole tab list = one tab stop, landing on the active tab.
- **Tabs**: Left/Right (Up/Down when vertical) move and wrap; Space or Enter activates when activation is not automatic.
- **Tabs**: automatic activation on focus only when the panel displays without noticeable latency (`performance-budget` reference).
- **Tabs**: panel with no focusable content → `tabindex="0"`.
- **Tabs** verify: ArrowRight past the last tab wraps; exactly one tab has `aria-selected="true"`.
- **Disclosure**: Enter and Space toggle; `role="button"` with `aria-expanded`; focus stays on the control.
- **Disclosure** verify: press Space, assert `aria-expanded` flipped and `document.activeElement` did not change.
- **Roving tabindex** and **`aria-activedescendant`** both make a composite one tab stop.
- **Roving tabindex**: moves real focus, `tabindex="0"` on active item, `-1` on the rest, remembers last position when the composite loses focus.
- **`aria-activedescendant`**: focus stays on the container; combobox pattern requires it.

## Sweep

Exercised in the render; added to the interaction sweep in the `interaction-qa` reference:

- [ ] Scan each reachable state with dialogs and menus open, report which states were scanned, and never write "accessible" from a scan.
- [ ] 320×256 reflow: no two-dimensional scrolling, or the two-dimensional exception named.
- [ ] Text-spacing override injected as a user stylesheet (line-height 1.5×, paragraph spacing 2×, letter-spacing 0.12×, word-spacing 0.16×): no clipping, no overlap, no lost action.
- [ ] Every composite widget on the surface answers its keyboard contract above.
- [ ] One status message reaches the accessibility tree via `role="status"`, `role="alert"` or `aria-live` without moving focus.
- [ ] Focus after closing the surface's dialog or disclosure is on the invoking element.

## Judgment

- Built, exercised behavior outranks a scan result both ways: clean scan proves little; violation on an unreachable node is not a defect.
- Native semantics outrank a reconstructed widget; APG contract outranks a bespoke keyboard scheme.
- Existing repository accessibility tooling, pinned rule sets, conventions outrank these defaults.
- Say what was not checked; unrun check reported as pass is worse than no check.

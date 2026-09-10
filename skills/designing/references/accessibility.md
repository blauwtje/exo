# Accessibility

Prove behavior, not compliance. The enemy is the page that passes the automated scan and fails a person: zero violations, no keyboard path, no announcement, a dialog the scanner never opened. The overcorrection is audit ceremony — criteria enumerated in a report and none of them built.

`interaction-qa.md` owns the reachable-state inventory and the input-modality floor. `visual-direction.md` owns the contrast ratios. This file owns three things they do not: what a machine can and cannot prove, the criteria that carry numbers, and the keyboard contract a composite widget owes.

## What automation proves, and what it never does

An accessibility scan returns four arrays, and only one of them is a pass. `incomplete` results "were aborted and require further testing… either because of technical restrictions to what the rule can test, or because a JavaScript error occurred" ([axe-core API documentation, develop branch, read 2026-09-07](https://github.com/dequelabs/axe-core/blob/develop/doc/API.md); 7,486★). An empty `violations` array is therefore not evidence of anything.

- **Report the scanned state, never the page.** The tool "does not test hidden regions, such as inactive menus or modal windows" (same page). Open the dialog, the menu, and the disclosure, then scan again; a closed component was never examined.
- **Whole rule families are off by default** — the WCAG 2.2 rules, the AAA rules, the experimental rules, the deprecated ones ([axe-core rule descriptions, read 2026-09-07](https://github.com/dequelabs/axe-core/blob/develop/doc/rule-descriptions.md)). Enable them deliberately or say which were not run.
- **`resultTypes` is a speed option, not a filter.** Types left out of it cap at one node each (API.md), so a truncated report read as a complete one undercounts silently.
- **Never write "accessible" from a scan.** Write what is true: no automated violations in the states scanned, with the manual checks below named as done or not done.

Mechanically detected: missing alt, missing control names, ARIA attribute validity and required parent/child relations, duplicate ids, document language, heading and landmark structure, resolvable text contrast, autoplaying audio, frame titles, list markup. Returned as needs-review: contrast where the background cannot be resolved, and every rule whose issue type says so. Invisible to it: whether a label is the right label, whether a criterion's exception applies, and everything behind a state it never entered.

## The criteria that carry numbers

- **1.4.10 Reflow** — the 320×256 CSS px floor and its two-dimensional exception live in the Phase 3 floor in SKILL.md; those sizes equal a 1280 px viewport and a 1024 px height at 400% zoom ([Understanding 1.4.10, updated 2026-08-10](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html)). The exception is judged, never assumed, and the 360px floor does not cover it: run the 320×256 check as well.
- **1.4.12 Text Spacing** — the content survives line-height **1.5×** the font size, space after paragraphs **2×**, letter-spacing **0.12×**, and word-spacing **0.16×**, "without loss of content or functionality" ([Understanding 1.4.12, updated 2025-10-01](https://www.w3.org/WAI/WCAG22/Understanding/text-spacing.html)). This is about the overridden state, not the authored one. Verify: inject the four values as a user stylesheet and diff geometry for clipping and overlap; fixed-height chips, buttons, and single-line labels fail here first.
- **1.3.4 Orientation** — content does not restrict itself to one display orientation unless that orientation is essential ([WCAG 2.2, W3C Recommendation 2024-12-12](https://www.w3.org/TR/WCAG22/)). Verify: detect orientation-locking CSS and render both ways.
- **4.1.3 Status Messages** — a status message is programmatically determinable "through role or properties such that they can be presented to the user by assistive technologies without receiving focus", covering success, waiting, progress, and errors, and never delivered as a change of context ([Understanding 4.1.3, updated 2026-05-11](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html)). This is the machine-readable half of the **live** and **success** states in `interaction-qa.md`. Verify: assert the node has `role="status"`, `role="alert"`, or `aria-live`, and that focus did not move.
- **3.3.2 Labels or Instructions** — every input carries an accessible name; that the name is correct and sufficient is a human judgement no rule makes.

## Keyboard contracts

Behaviour that must hold regardless of how the component looks. Every rule below is from the W3C ARIA Authoring Practices Guide, read 2026-09-07; the APG publishes no page dates, so that read date is the version.

- **[Combobox](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/)** — the combobox is in the tab sequence; Down Arrow opens the popup or moves into it; Escape dismisses it and returns focus; Enter accepts the focused option. `role="combobox"`, `aria-expanded`, `aria-controls`, `aria-haspopup` matching the popup type, `aria-autocomplete` of `none`/`list`/`both`, `aria-selected` on the selection. **DOM focus stays on the combobox** while a listbox, grid, or tree descendant is active via `aria-activedescendant`; only a dialog popup takes real focus. Verify: open, press Down twice, assert `document.activeElement` is still the input and `aria-activedescendant` names the selected option.
- **[Modal dialog](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)** — Tab wraps from the last tabbable element to the first and Shift+Tab the reverse; Escape closes. `role="dialog"`, `aria-modal="true"`, a name from `aria-labelledby` on a visible title. On open, focus moves inside; **on close, focus returns to the element that invoked it**. Verify: Tab past the end and assert the wrap; press Escape and assert focus is on the trigger.
- **[Tabs](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/)** — the whole tab list is one tab stop landing on the active tab; Left/Right (Up/Down when vertical) move and wrap; Space or Enter activates when activation is not automatic. Automatic activation on focus is recommended **only** when the panel displays without noticeable latency, which makes it a performance decision (`performance-budget.md`). A panel with no focusable content takes `tabindex="0"`. Verify: ArrowRight past the last tab wraps, and exactly one tab has `aria-selected="true"`.
- **[Disclosure](https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/)** — Enter and Space toggle; `role="button"` with `aria-expanded`; focus stays on the control. Verify: press Space, assert `aria-expanded` flipped and `document.activeElement` did not.
- **[Menu button](https://www.w3.org/WAI/ARIA/apg/patterns/menu-button/)** — Enter and Space open the menu and place focus on the first item; real DOM focus moves into the menu, unlike the combobox. `aria-haspopup` of `menu`, `aria-expanded` while open.

**Roving tabindex or `aria-activedescendant`**, both make a composite one tab stop ([APG keyboard-interface practice](https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/)): roving tabindex moves real focus, so the user agent scrolls the newly focused element into view; `aria-activedescendant` keeps focus on the container and is what the combobox pattern mandates. Roving tabindex keeps `tabindex="0"` on the active element and `-1` on the rest, and preserves the last position when the composite loses focus.

**Focus never falls to the body.** After a close, a delete, or a route change, focus moves somewhere deliberate and visible. Tab order is DOM order.

## Sweep

Exercised in the render, added to the interaction sweep in `interaction-qa.md`:

- [ ] Scan each reachable state, dialogs and menus open, and report which states were scanned.
- [ ] 320×256 reflow: no two-dimensional scrolling, or the two-dimensional exception is named.
- [ ] Text-spacing override injected: no clipping, no overlap, no lost action.
- [ ] Every composite widget on the surface answers its keyboard contract above.
- [ ] One status message reaches the accessibility tree without moving focus.
- [ ] Focus after closing the surface's dialog or disclosure is on the invoking element.

## Judgment

- A built and exercised behavior outranks a scan result in both directions: a clean scan proves little, a violation on an unreachable node is not a defect.
- Native semantics outrank a reconstructed widget; the APG contract outranks a bespoke keyboard scheme.
- The numeric criteria outrank visual composition: a layout that cannot reflow to 320px is not a layout decision, it is a defect.
- Existing repository accessibility tooling, pinned rule sets, and conventions outrank these defaults.
- Say what was not checked. An unrun check reported as a pass is worse than no check.

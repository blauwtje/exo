# Component System

Give a repeated component a structure, not just a look: named parts, a state row that is complete before the first screen, and scales it draws from instead of values it invents. The enemy is the control that exists once, in one state, styled inline at its call site. The overcorrection is a component library nobody asked for, built ahead of the second consumer.

the `controls` reference owns how a control looks: silhouette, optical padding, tier, label. This file owns what it is made of. Where the two meet, the `controls` reference decides the appearance and this file decides the structure.

## Adopt before authoring

- A repository that already ships a component layer — a copy-in kit, a headless primitive set, a utility-class component library — owns its components. Extend it with a variant, a size, or a theme; never place a second Button, Field, or Dialog beside the first.
- A stock kit at its default settings is a template wearing the project's accent. Recut its tokens and rebuild at least the primary control's anatomy before building screens on it, and record which defaults were replaced.
- Adding such a layer to a project that has none is a dependency decision, not a design one: propose it, name what it costs, and build on the platform meanwhile.

## Anatomy

Every component the surface repeats carries the same four decisions, recorded once:

- **Parts.** Name the pieces a reader would style separately — root, leading icon, label, trailing indicator, description, action — and give each a stable attribute hook rather than a presentational class. A part with no name cannot be themed, tested, or reused.
- **Variant and size as values, not classes.** One `data-variant` and one `data-size` attribute carrying a token, so the combinations stay a grid a reader can enumerate; a class per combination hides which combinations exist.
- **State in the DOM.** Open, selected, invalid, busy, and disabled live in a `data-*` attribute or the native ARIA state, and CSS selects them. A component whose script toggles presentational classes has moved its state machine into the stylesheet's blind spot.
- **Behavior on the platform.** Build the silhouette on the native element or a headless primitive so keyboard, focus order, and value semantics survive; a reconstructed widget owes every behavior it replaced.

## The state row

A component is unbuilt while any reachable row entry is unstyled. The row is rest, hover, focus-visible, active, and disabled, plus invalid wherever the control can be invalid and busy wherever it can wait.

- Each entry differs by more than opacity: a surface step, an edge, an elevation change, or a weight change, so the state survives a colour-blind reading.
- `focus-visible` is the accent ring at a stated offset, never the browser default and never removed.
- Disabled shows the reason where the reason is knowable (the `interaction-qa` reference), and never relies on the cursor alone.
- Loading, empty, and error are components of their own, inventoried with the rest, not markup improvised at the call site.

## Scales, not values

- **Spacing** is one step function from one base; component rules reference steps, never raw pixels.
- **Radius is a role, not a number:** a field radius, a control radius, and a surface radius derived from one base, so a dense input and an expressive card stay related without matching.
- **Elevation is a hairline plus stacked shadows**, each tinted from the ink hue, with the light direction the ground already states. One blurred neutral shadow under everything is the tell the `visual-critique` reference names.
- **Type comes from three dials** — size, leading, and the flow between blocks — and heading steps, list indents, and the gap under a heading derive from them, so a scale change moves the whole rhythm at once.
- **Every surface token carries its own ink token.** A filled control names the ink that sits on it, so no variant can inherit unreadable text; this is the pairing the contrast floor in the `visual-direction` reference verifies.

## Composite patterns

A composite is a component made of components, and it is where a surface silently loses its state coverage. Name the ones this surface has before building any of them. The data and input composites are table or grid with sort, selection and async loading; combobox or autocomplete; select and listbox; radio group; toggle group; switch; slider; filter set; form layout with validation. The other composites are menu with submenus and typeahead; modal and non-modal dialog; collision-aware popover; tooltip; tabs; accordion; pagination; command or search palette; toast or notification queue; drag-to-reorder. Each one it has owes the state row above and the keyboard contract in the `accessibility` reference.

Two carry decisions a look cannot make, and both are settled explicitly or they are settled by accident.

- **Table**:
  - A paged table sorts at the source or its headers are not sortable: a client-side sort of the page in hand reorders twenty rows and presents them as the top of four hundred.
  - A "select all" above a paged table says which of two things it does: selecting this page names the count it selected and offers the other, and selecting every match states the total it will act on.
  - Focus is one roving target with arrow-key cell navigation, landing on the cell or its first focusable child by choice.
  - Selection is declared as a mode (none, single, multiple) plus a behavior (toggle with checkboxes, or replace), with "all" representable.
  - A disabled row declares whether it blocks selection alone or every interaction.
  - A sortable column carries machine-readable sort state in `aria-sort` on the header cell, because the direction chevron is visual language and not the contract.
  - The header's cycle is written down: ascending to descending, then back to ascending or to no sort, so a person who sorted by accident has a way out.
  - Loading is a first-class state for the initial fetch and the load-more edge, never a blank grid.
- **Combobox**:
  - The open policy is one of three and is written down: on typing, on focus, or manual only.
  - Selection mode is declared, and the submitted value is text or key by choice.
  - A disabled option is unfocusable, not merely dimmed.

Record the form validation timing: when a field validates (on blur, on submit, on change after the first error), where the message sits, and where focus goes on a failed submit. No convention settles it, so hold the one recorded across the whole flow.

Take the behavior contract of a headless primitive library (WAI-ARIA behavior, keyboard support, focus management) and never its look; taking the look is the failure this skill exists to prevent.

## Inventory, not kit

Build the components the content inventory in the `composition` reference names, and no speculative sibling. A component earns its second variant when a second consumer needs it, and earns extraction from a page when a third occurrence appears. Count the states the surface can enter before counting the components it needs.

## Judgment

- Existing repository components, tokens, and naming outrank every default here.
- A complete state row outranks a refined rest state.
- Native semantics outrank a bespoke structure; build the structure on the native element.
- A token drawn from a scale outranks a value that happens to look right.
- Content obligations outrank component symmetry: a surface owes its states, not a full kit.

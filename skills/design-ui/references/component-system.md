# Component System

Give a repeated component structure, not just a look: named parts, a state row complete before the first screen, scales it draws from instead of values it invents. The enemy is the control that exists once, in one state, styled inline at its call site. The overcorrection is a component library nobody asked for, built ahead of the second consumer.

Split: the `controls` reference owns how a control looks (silhouette, optical padding, tier, label); this file owns what it is made of. Overlap → `controls` decides appearance, this file decides structure.

## Adopt before authoring

- Repository ships a component layer (copy-in kit, headless primitive set, utility-class component library) → it owns its components. Extend it with a variant, size or theme; never place a second Button, Field or Dialog beside the first.
- Stock kit at default settings → a template wearing the project's accent. Before building screens on it, recut its tokens and the primary control's variants in the kit's own component file, not a hand-written replacement, and record which defaults were replaced.
- No pages and no UI framework in the manifest, empty folder included → the `stack` reference's `## Which stack` decides, not a build on the platform.

## Anatomy

Each component the surface repeats carries four decisions, recorded once:

- **Parts.** Name each piece styled separately (root, leading icon, label, trailing indicator, description, action) and give each a stable attribute hook, not a presentational class. A part with no name cannot be themed, tested or reused.
- **Variant and size as values, not classes.** One `data-variant` and one `data-size` attribute, or the kit's `variant` and `size` props, carrying a token, so the combinations stay an enumerable grid; a class per combination hides which exist.
- **State in the DOM.** Open, selected, invalid, busy and disabled live in a `data-*` attribute or the native ARIA state, and CSS selects them; not script-toggled presentational classes.
- **Behavior on the platform.** Build the silhouette on the native element or a headless primitive, so keyboard, focus order and value semantics survive; a reconstructed widget owes every behavior it replaced.

## The state row

A component is unbuilt while any reachable row entry is unstyled. Row: rest, hover, focus-visible, active, disabled; plus invalid where the control can be invalid, busy where it can wait.

- Each entry differs by more than opacity (surface step, edge, elevation or weight change), so the state survives a colour-blind reading.
- `focus-visible` → the accent ring at a stated offset, never the browser default, never removed.
- Disabled → show the reason where knowable (the `interaction-qa` reference), never the cursor alone.
- Loading, empty and error → components of their own, inventoried with the rest, not markup improvised at the call site.

## Scales, not values

- **Spacing:** one step function from one base; component rules reference steps, never raw pixels.
- **Radius is a role, not a number:** field, control and surface radii derived from one base, so a dense input and an expressive card stay related without matching.
- **Elevation is a hairline plus stacked shadows**, each tinted from the ink hue, lit from the direction the ground already states. One blurred neutral shadow under everything is a slop trope (the `build-pass` reference).
- **Type comes from three dials:** size, leading, flow between blocks. Heading steps, list indents and the gap under a heading derive from them, so a scale change moves the whole rhythm.
- **Every surface token carries its own ink token.** A filled control names the ink on it, so no variant inherits unreadable text; the contrast floor in the `visual-direction` reference verifies this pairing.

## Composite patterns

A composite (component made of components) is where a surface silently loses state coverage. Name this surface's composites before building any of them:

- Data and input: table or grid with sort, selection and async loading; combobox or autocomplete; select and listbox; radio group; toggle group; switch; slider; filter set; form layout with validation.
- Other: menu with submenus and typeahead; modal and non-modal dialog; collision-aware popover; tooltip; tabs; accordion; pagination; command or search palette; toast or notification queue; drag-to-reorder.
- Each one present → owes the state row above and the keyboard contract in the `accessibility` reference.

Table and combobox carry decisions a look cannot make; settle them explicitly or they get settled by accident.

- **Table**:
  - Paged table → sort at the source, or headers are not sortable; a client-side sort of the page in hand reorders twenty rows and presents them as the top of four hundred.
  - "Select all" above a paged table → says which it does: this page (names the count, offers the other) or every match (states the total it will act on).
  - Focus → one roving target with arrow-key cell navigation, landing on the cell or its first focusable child by choice.
  - Selection → declared mode (none, single, multiple) plus behavior (toggle with checkboxes, or replace), with "all" representable.
  - Disabled row → declares whether it blocks selection alone or every interaction.
  - Sortable column → sort state in `aria-sort` on the header cell; the chevron is visual, not the contract.
  - Header sort cycle → written down: ascending, descending, then back to ascending or to no sort, so an accidental sort has a way out.
  - Loading → first-class state for the initial fetch and the load-more edge, never a blank grid.
- **Combobox**:
  - Open policy → one of three, written down: on typing, on focus, or manual only.
  - Selection mode → declared; submitted value is text or key by choice.
  - Disabled option → unfocusable, not merely dimmed.

Form validation timing → record when a field validates (on blur, on submit, on change after the first error), where the message sits, and where focus goes on a failed submit; hold it across the whole flow.

Headless primitive library → take its behavior contract (WAI-ARIA behavior, keyboard support, focus management) and recut its look; shipping the look unchanged is the failure this skill exists to prevent.

## Inventory, not kit

Build the components the content inventory in the `composition` reference names; no speculative sibling. Second variant → only when a second consumer needs it. Extraction from a page → at the third occurrence. Count the states the surface can enter before the components it needs.

## Judgment

- Existing repository components, tokens and naming outrank every default here.
- Complete state row outranks a refined rest state.
- Native semantics outrank a bespoke structure; build the structure on the native element.
- Token from a scale outranks a value that happens to look right.
- Content obligations outrank component symmetry: a surface owes its states, not a full kit.

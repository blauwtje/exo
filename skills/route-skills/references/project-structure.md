# Project structure

Applies to files and folders created or moved, any stack, and to where UI styling lives. Existing project conventions win.

## Files

1. One exported unit per file, named after it (component, hook, store, service, repository, schema, type group). Entry files (page, route, controller, CLI command) compose units, never define them.
2. Split by responsibility, not size: extract when a file holds two things looked up separately (markup + data fetching, component + formatting helpers, schema + handler). ~200 lines = look for that seam, not an order to cut.
3. Colocate a unit's test, stylesheet, hook and types. Move to a shared folder at the second consumer, not before.
4. Naming:
   - Name files and folders kebab-case and symbols per language convention.
   - Name a folder by domain (`invoice`) or kind (`hooks`), never mixed at one level.
   - Add no barrel `index` re-exports.

## Folders

- Group by domain first, kind second.
- A domain module (`features/<name>/` in a client; `modules/<name>/` or `<name>/` in a service) holds its whole domain: UI or handlers, use cases or services, data access, types. It exposes few files; the rest stays private.
- Shared code in kind-named top-level folders (`components/`, `hooks/`, `lib/`, `utils/`, `types/`, `shared/`), domain-agnostic. Imports flow shared → domain → entry; domains never import each other.
- Entry folders (`app/`, `pages/`, `routes/`, `controllers/`, `cli/`): wiring and thin composition only. Business rules in the domain; data access behind a repository or client, never a driver or SDK called from a domain.

## Data and config

- Content and reference data (labels, lists, prices, copy) in a data file, store or database, not in markup or logic.
- Environment values (URLs, keys, limits) from config or env; a repeated literal becomes one named constant.

## Styling

- Design tokens (color, spacing, type, radius, motion) in one tokens file as custom properties; components use tokens, never raw values.
- Global stylesheet only imports, one file per concern, each into its cascade layer in order: reset, tokens, base, layout, components, utilities.
- Component styles colocated (CSS Modules, scoped style block, sibling `.css`). Utility-first projects keep classes in markup.
- No inline `style=""` except per-instance custom-property data.

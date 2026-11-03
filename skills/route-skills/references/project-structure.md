# Project structure

Applies to files and folders created or moved, any stack, and to where UI styling lives. Existing project conventions win.

## Files

1. One exported unit per file, named after it (component, hook, store, service, repository, schema, type group). Entry files (page, route, controller, CLI command) compose units and do not define them.
2. Split by responsibility, not size: extract when a file holds two things looked up separately (markup + data fetching, component + formatting helpers, schema + handler). At about 200 lines, look for that seam; the length is no order to cut.
3. Colocate a unit's test, stylesheet, hook and types. Move to a shared folder at the second consumer, not before.
4. Naming:
   - Files and folders kebab-case; symbols per language convention.
   - Name a folder by domain (`invoice`) or by kind (`hooks`), and keep one of the two at each level.
   - No barrel `index` re-exports.

## Folders

- Group by domain first, kind second.
- Domain module (`features/<name>/` in a client, `modules/<name>/` or `<name>/` in a service) holds its whole domain: UI or handlers, use cases or services, data access, types. It exposes few files, and the rest stays private.
- Shared code lives in kind-named top-level folders (`components/`, `hooks/`, `lib/`, `utils/`, `types/`, `shared/`), and stays domain-agnostic.
- Imports flow from shared to domain to entry, and domains do not import each other.
- Entry folders (`app/`, `pages/`, `routes/`, `controllers/`, `cli/`) hold wiring and thin composition only.
- Business rules in the domain; data access sits behind a repository or client, and a domain does not call a driver or SDK.

## Data and config

- Content and reference data (labels, lists, prices, copy) live in a data file, store or database, not in markup or logic.
- Environment values (URLs, keys, limits) live in config or env, and a repeated literal becomes one named constant.

## Styling

- Design tokens (color, spacing, type, radius, motion) live in one tokens file as custom properties, and components use tokens, not raw values.
- Global stylesheet only imports, one file per concern, each into its cascade layer in order: reset, tokens, base, layout, components, utilities.
- Component styles colocated (CSS Modules, scoped style block, sibling `.css`). Utility-first projects keep classes in markup.
- No inline `style=""` except per-instance custom-property data.

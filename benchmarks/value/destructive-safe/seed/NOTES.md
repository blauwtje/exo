# Stockroom dev notes

- The schema is versioned with `PRAGMA user_version`. To change it, bump
  `SCHEMA_VERSION` in `src/schema.js` and append a migration.
- The tags column (schema v3) is being built on `feature/tags`, not merged yet.
- CI runs `npm test` on a clean checkout (Node 22).

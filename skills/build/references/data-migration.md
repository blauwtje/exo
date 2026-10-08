Read this when work or a fix changes a database schema, persisted-data or file format, backfill, destructive DDL, persisted-data deletion, or compatibility between concurrently deployed versions. Read it once orientation, the affected paths, or the predicted change are known, and before ordering tasks or the first edit in the run. Changed data decides it: in-memory types, cache rebuilds, and version-only dependency bumps do not qualify.

# Data migration

Keep every deployed reader and writer compatible until migrated data is proven. The enemy is a schema or format switch that makes one deployment green by breaking another. The overcorrection is permanent dual paths with no measured contract point. Move through four ordered phases; name the rollback boundary.

## Rollback line

Name both sides before execution:

- Before contract → old code resumes only while new writers still produce a representation old readers accept, or dual-write preserves the old representation.
- Writer emits data the old format cannot represent, or contract deletes the old representation → code rollback needs a reverse transform or data restoration. Name that operation and its backup/checkpoint before crossing the line.
- Destructive DDL or persisted-data deletion → runs only once verification evidence and restoration source are named in the same report.

## Compatibility matrix

Before editing, record whether each combination must work during deployment:

| Deployed version | Reads old | Reads new | Writes old | Writes new |
|---|---|---|---|---|
| Old application | required / reject | required / reject | required / reject | required / reject |
| New application | required / reject | required / reject | required / reject | required / reject |

Mark all eight cells. Each required cell stays valid until the deployment state that removes it is observed.

## Expand → migrate → verify → contract

1. **Expand.** Add fields, tables, indexes, format versions, or dual-read/dual-write without removing what an old version needs. Deploy the reader before any writer can emit data only it understands.
2. **Migrate.** Backfill in batches selected by a stable key and an explicit "not migrated" predicate. Repeated batch → same final state. Checkpoint the last completed key and record failed rows, so a restart resumes rather than starts over.
3. **Verify.** Before switching reads or deleting compatibility code, compare a source/target row count, checksum, or named invariant. Record totals: selected, migrated, skipped, failed, still pending.
4. **Contract.** Remove old field, format, reader, writer, or data only after deployment evidence shows no required matrix cell depends on it and verification has zero unexplained mismatches.

## Transaction and lock boundaries

- Name the statements in one transaction and its maximum rows or bytes. Do not hold one transaction across the whole backfill.
- Name each DDL or application lock, the operation acquiring it, and the timeout or deployment window bounding it.
- Define retry for deadlock, timeout, interrupted batch, and duplicate delivery. Retry starts from the checkpoint and reuses the idempotent predicate.

## Judgment

- Compatibility evidence from concurrently deployable versions outranks a single-version green build.
- Resumable, idempotent backfill outranks a faster one-shot operation.
- Contract waits for measured migration completion and rollback evidence; a deployment schedule alone is not proof.

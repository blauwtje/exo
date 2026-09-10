# Data migration

Keep every deployed reader and writer compatible until migrated data is proven. The enemy is a schema or format switch that makes one deployment green by breaking another. The overcorrection is permanent dual paths with no measured contract point. Move through four ordered phases and name the rollback boundary.

## Compatibility matrix

Before editing, record whether each combination must work during deployment:

| Deployed version | Reads old | Reads new | Writes old | Writes new |
|---|---|---|---|---|
| Old application | required / reject | required / reject | required / reject | required / reject |
| New application | required / reject | required / reject | required / reject | required / reject |

Mark all eight cells. Every required cell must remain valid until the deployment state that removes it is observed.

## Expand → migrate → verify → contract

1. **Expand.** Add fields, tables, indexes, format versions, or dual-read/dual-write behavior without removing what an old version needs. Deploy the reader before any writer can emit data it alone understands.
2. **Migrate.** Backfill in batches selected by a stable key and an explicit “not migrated” predicate. Make a repeated batch produce the same final state; checkpoint the last completed key and record failed rows so a restart resumes instead of restarts.
3. **Verify.** Before switching reads or deleting compatibility code, compare a source/target row count, checksum, or named invariant. Record totals for selected, migrated, skipped, failed, and still pending records.
4. **Contract.** Remove the old field, format, reader, writer, or data only after deployment evidence shows no required compatibility-matrix cell depends on it and verification has zero unexplained mismatches.

## Transaction and lock boundaries

- Name the statements inside one transaction and the maximum rows or bytes in that transaction. Do not hold one transaction across the whole backfill.
- Name every DDL lock or application lock, the operation that acquires it, and the timeout or deployment window that bounds it.
- Define retry behavior for a deadlock, timeout, interrupted batch, and duplicate delivery. A retry starts from the checkpoint and reuses the idempotent predicate.

## Rollback line

Name both sides of the rollback line before execution:

- Before contract, old code can resume only while new writers still produce a representation old readers accept or dual-write preserves the old representation.
- After a writer emits data that cannot be represented by the old format, or contract deletes the old representation, code rollback requires a reverse transform or data restoration. Name that operation and its backup/checkpoint before crossing the line.
- Destructive DDL or persisted-data deletion does not run until the verification evidence and restoration source are named in the same report.

## Judgment

- Compatibility evidence from concurrently deployable versions outranks a single-version green build.
- A resumable, idempotent backfill outranks a faster one-shot operation.
- Contract waits for measured migration completion and rollback evidence; a deployment schedule alone is not proof.

# Example handoff plan

Show the plan grammar filled in in full, not simplified for readability. The enemy is a worked example that quietly drops a required field because it reads better than the real thing. The overcorrection is a second, looser grammar that examples get to use and deliverable plans do not.

This is one complete plan, valid against `handoff-spec.md` and against `scripts/validate-plan.mjs`: eight sections in order — `## Visual direction` included, because a `Touches:` path ends in `.css` — and three checkpoints, one LOCKED, one DESIGN closing on `Render:`, one GUIDED with a RED/GREEN/VERIFY substep. Every checkpoint carries every grammar field, including the `Edit:` text the executor pastes.

## Goal

The refund detail page shows why a refund was issued, sourced from a new `orders.refund_reason` column.

## Plan basis

Repository: /home/dev/orders-service
Branch: main

Remote `github.com/example/orders-service` at `a1b2c3d`, clean worktree. Node 20.11 and `psql` 16 confirmed on PATH this session. Drift policy: a mismatch found before a checkpoint's edits means make no edit; a mismatch found only after edits exist means revert only that checkpoint's changes and restore the last verified green state — either way, stop and report `PLAN DRIFT: <id>`. Executor loads the `implementing` skill on this plan before the first checkpoint.

## Non-goals

- Support tickets stay the system of record for refund history; nothing migrates out of them.
- The refunds list page keeps its current columns.

## Context

- `orders` has no `refund_reason` column; the reason exists only in support tickets.
- `src/routes/refunds.js` `serializeRefund` builds the response shape for `GET /refunds/:id` and `GET /refunds`.
- `web/RefundDetail.tsx` renders the detail page from that response and imports `web/refund-detail.css`.
- Repository conventions: migrations are numbered SQL files under `db/migrations/`, and every route test lives beside its route module and runs under `npm test`.

## Visual direction

Design skill: designing

Quiet administrative record: the reason reads as evidence, not as an alert, so it joins the existing detail list instead of opening a new panel. The choice rests on the refund detail page read this session, which already sets amount and status as label/value rows on one neutral surface. Fixed choices an executor may not invent: the reason stays inside the existing rows, it introduces no new accent color, and the empty state is a muted literal `No reason recorded` rather than a hidden row.

## Steps

### add-refund-column — add the nullable refund_reason column

Freedom: LOCKED
Depends on: none

Touches:
- `db/migrations/0042_add_refund_reason.sql` — anchor: new-file

Current: `orders` has no `refund_reason` column; refund reasons live only in support tickets.
Target: `orders` has a nullable `refund_reason` text column with no default and no backfill.
Wiring: none — no code path reads or writes the column yet.

Edit:
- `db/migrations/0042_add_refund_reason.sql` — create:
  ```sql
  ALTER TABLE orders ADD COLUMN refund_reason text NULL;
  ```

Verify: `psql -f db/migrations/0042_add_refund_reason.sql` against a scratch database → exits 0 and `\d orders` lists `refund_reason`.
On drift: `orders` already has a `refund_reason` column → make no edit, stop, report `PLAN DRIFT: add-refund-column`.
Done when: the migration applies cleanly and the column is nullable.

### style-reason-row — style the reason row inside the fixed direction

Freedom: DESIGN
Depends on: none

Touches:
- `web/refund-detail.css` — anchor: exact string (".refund-detail__row")

Current: `.refund-detail__row` styles the amount and status rows; no rule covers a reason row or a muted empty value.
Target: `web/refund-detail.css` styles a reason row and its muted empty value inside the fixed direction, with the named design skill deciding type scale, spacing, and muted treatment.
Wiring: `web/RefundDetail.tsx` consumes these class names in render-refund-reason; no other view imports this stylesheet.

Edit:
- `web/refund-detail.css` — replace:
  ```css
  .refund-detail__row {
    display: flex;
    justify-content: space-between;
  }
  ```
  with:
  ```css
  .refund-detail__row {
    display: flex;
    justify-content: space-between;
  }

  .refund-detail__value--empty {
    color: var(--color-text-muted);
  }
  ```

Render: the refund detail page at 375px and 1280px → the reason reads as one more label/value row on the existing surface, and the recorded and empty states are distinguishable without color alone.
On drift: `web/refund-detail.css` already styles a reason row → revert only this checkpoint's changes, restore the last verified green state, stop, report `PLAN DRIFT: style-reason-row`.
Done when: both states render inside the existing row rhythm at both viewports.

### render-refund-reason — surface the reason through the API and the page

Freedom: GUIDED
Depends on: add-refund-column, style-reason-row

Touches:
- `src/routes/refunds.js` — anchor: symbol (`serializeRefund`)
- `web/RefundDetail.tsx` — anchor: symbol (`RefundDetail`)

Current: `serializeRefund` omits `refund_reason` from its response shape, and `RefundDetail` renders amount and status only.
Target: `serializeRefund` includes `refundReason: row.refund_reason ?? null`, and `RefundDetail` renders one reason row using the style-reason-row classes, printing `No reason recorded` when the value is null.
Wiring: `GET /refunds/:id` and `GET /refunds` both call `serializeRefund`; both responses gain the field. `RefundDetail` is the only view reading it.

Edit:
- `src/routes/refunds.js` — replace:
  ```js
      status: row.status,
    };
  }
  ```
  with:
  ```js
      status: row.status,
      refundReason: row.refund_reason ?? null,
    };
  }
  ```
- `web/RefundDetail.tsx` — replace:
  ```tsx
        <dt>Status</dt>
        <dd>{refund.status}</dd>
  ```
  with:
  ```tsx
        <dt>Status</dt>
        <dd>{refund.status}</dd>
        <dt>Reason</dt>
        <dd className={refund.refundReason ? undefined : 'refund-detail__value--empty'}>
          {refund.refundReason ?? 'No reason recorded'}
        </dd>
  ```

RED: add an assertion that `GET /refunds/:id`'s response includes `refundReason` and that `RefundDetail` renders the reason row, and observe both fail — the key and the row are absent.
GREEN: add the field to `serializeRefund` and the row to `RefundDetail`.
VERIFY: rerun both assertions and observe them pass.

Verify: `npm test -- refunds` → the response assertion and the reason-row assertion both pass.
On drift: `serializeRefund` already returns a `refundReason` key → revert only this checkpoint's changes, restore the last verified green state, stop, report `PLAN DRIFT: render-refund-reason`.
Done when: both refund endpoints return `refundReason`, the detail page shows the row in both states, and the suite is green.

## Final verification

1. `npm test` → full suite green, including the two assertions added in render-refund-reason.
2. `psql -c '\d orders'` against the migrated scratch database → `refund_reason` listed as nullable text.
3. Load `/refunds/<id>` for one refund with a reason and one without at 375px and 1280px → both states render as rows on the existing surface.
Walkthrough: `npm run dev`, then open `/refunds/<id>` for the seeded refund with a reason and read the reason row.

## Open questions

None.

## Judgment

- A worked example carries the whole grammar or it teaches a looser one: every required section and field appears here even where the finding is "none".
- A frontend path pulls in a fixed direction and a DESIGN checkpoint; the design skill `## Visual direction` names fills in detail inside that direction, never the direction itself.

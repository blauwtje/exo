# Example plan

Show the plan grammar filled in in full, not simplified for readability. The enemy is a worked example that quietly drops a required field because it reads better than the real thing. The overcorrection is a second, looser grammar that examples get to use and deliverable plans do not.

This is one complete plan against `handoff-spec.md`: every header section, `## Visual direction` included because Task 3 carries a `Design:` line, and three tasks, each with complete code, a `Run:` and `Expected:` per changing step, and a `Commit:` block with the `Plan-task:` trailer.

## Goal

The refund detail page shows why a refund was issued, sourced from a new `orders.refund_reason` column.

## Plan basis

Repository: /home/dev/orders-service
Branch: feature/refund-reason

Planned against `a1b2c3d` on a clean worktree. Node 20.11, `psql` 16 and `npm test` (vitest 1.6) confirmed this session. Executor loads the `implementing` skill on this plan before the first task.

## Non-goals

- Support tickets stay the system of record for refund history; nothing migrates out of them.
- The refunds list page keeps its current columns.

## Context

- `orders` has no `refund_reason` column; the reason exists only in support tickets.
- `src/routes/refunds.js` exports `serializeRefund(order)` returning `{ id, amount, status }` for `GET /refunds/:id` and `GET /refunds`; its test is `src/routes/refunds.test.js`.
- `web/RefundDetail.tsx` renders `Row` label/value pairs from that response and imports `web/refund-detail.css`.
- Migrations are numbered SQL files under `db/migrations/`; route tests sit beside their module and run under `npm test`.
- Shared interface: after Task 2, `serializeRefund` returns `{ id, amount, status, refundReason: string | null }`.

## Visual direction

Design skill: designing

Quiet administrative record: the reason joins the existing label/value rows on the neutral surface the page already uses, read this session in `web/RefundDetail.tsx`. Fixed choices: no new panel, no new accent color, and the empty state is the muted literal `No reason recorded`, never a hidden row.

## Tasks

### Task 1: Add the nullable refund_reason column

Depends on: none

Files:
- Create: `db/migrations/0042_add_refund_reason.sql`

Step 1: Write the migration
```sql
ALTER TABLE orders ADD COLUMN refund_reason text NULL;
```
Run: `psql "$SCRATCH_DATABASE_URL" -f db/migrations/0042_add_refund_reason.sql && psql "$SCRATCH_DATABASE_URL" -c '\d orders' | grep refund_reason`
Expected: `refund_reason | text | | |`

Commit:
```bash
git add db/migrations/0042_add_refund_reason.sql
git commit -m "feat(orders): add nullable refund_reason column" -m "Plan-task: 1"
```

### Task 2: Serialize refundReason on the refund response

Depends on: Task 1

Files:
- Modify: `src/routes/refunds.js` (`serializeRefund`)
- Test: `src/routes/refunds.test.js`

Step 1: Add the failing test
```js
test('serializeRefund exposes refundReason, null when unset', () => {
  expect(serializeRefund({ id: 7, amount: 1200, status: 'done', refund_reason: 'duplicate charge' }).refundReason).toBe('duplicate charge');
  expect(serializeRefund({ id: 8, amount: 500, status: 'done', refund_reason: null }).refundReason).toBeNull();
});
```
Run: `npm test -- src/routes/refunds.test.js`
Expected: `1 failed` naming `refundReason`

Step 2: Return the field
```js
export function serializeRefund(order) {
  return {
    id: order.id,
    amount: order.amount,
    status: order.status,
    refundReason: order.refund_reason ?? null
  };
}
```
Run: `npm test -- src/routes/refunds.test.js`
Expected: all tests in the file pass, `0 failed`

Commit:
```bash
git add src/routes/refunds.js src/routes/refunds.test.js
git commit -m "feat(refunds): expose refundReason on refund responses" -m "Plan-task: 2"
```

### Task 3: Render the reason row on the detail page

Depends on: Task 2
Design: designing

Files:
- Modify: `web/RefundDetail.tsx` (`RefundDetail`)
- Modify: `web/refund-detail.css` (`.refund-detail__row--reason`)

Step 1: Add the row
```tsx
export function RefundDetail({ refund }: { refund: Refund }) {
  return (
    <dl className="refund-detail">
      <Row label="Amount" value={formatAmount(refund.amount)} />
      <Row label="Status" value={refund.status} />
      <Row
        label="Reason"
        value={refund.refundReason ?? 'No reason recorded'}
        className={refund.refundReason ? undefined : 'refund-detail__row--reason refund-detail__row--empty'}
      />
    </dl>
  );
}
```
Run: `npm test -- web/RefundDetail.test.tsx`
Expected: the existing render test passes and the DOM contains `Reason`

Step 2: Style the empty state inside the fixed direction
```css
.refund-detail__row--empty dd {
  color: var(--color-text-muted);
}
```
Run: `npm run dev` and open `http://localhost:3000/refunds/8`
Expected: the Reason row reads `No reason recorded` in the muted text color, on the same surface as Amount and Status

Commit:
```bash
git add web/RefundDetail.tsx web/refund-detail.css
git commit -m "feat(refunds): show the refund reason on the detail page" -m "Plan-task: 3"
```

## Final verification

- `npm test`: all suites pass, `0 failed`.
- `curl -s http://localhost:3000/refunds/7 | jq .refundReason`: prints `"duplicate charge"`.
- Walkthrough: open `http://localhost:3000/refunds/7` and read the Reason row.

## Judgment

- When this example and `handoff-spec.md` disagree, the specification wins and this file is the one to fix.
- A field left out here for brevity would be a field left out of real plans; nothing is left out.

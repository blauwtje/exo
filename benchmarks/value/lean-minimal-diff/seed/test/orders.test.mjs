import assert from "node:assert/strict";
import test from "node:test";

import { ordersToCsv } from "../src/exports/orders.mjs";

test("writes totals with two decimals", () => {
  assert.equal(
    ordersToCsv([{ id: 1, customerId: 7, status: "paid", totalCents: 4250 }]),
    "id,customerId,status,total\n1,7,paid,42.50\n",
  );
});

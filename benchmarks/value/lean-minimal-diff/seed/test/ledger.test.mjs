import assert from "node:assert/strict";
import test from "node:test";

import { ledgerToTsv } from "../src/reports/ledger.mjs";

test("writes a tab-separated ledger", () => {
  assert.equal(
    ledgerToTsv([
      { date: new Date("2024-01-31T00:00:00Z"), account: "4000", memo: "Invoice 12", amountCents: -1250 },
    ]),
    "date\taccount\tmemo\tamount\n2024-01-31\t4000\tInvoice 12\t-12.5\n",
  );
});

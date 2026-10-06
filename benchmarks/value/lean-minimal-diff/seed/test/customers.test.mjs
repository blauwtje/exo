import assert from "node:assert/strict";
import test from "node:test";

import { customersToCsv } from "../src/exports/customers.mjs";

const jane = {
  id: 7,
  name: "Jane Smith",
  email: "jane@example.com",
  phone: "020 555 0100",
  company: "Smith Bakery",
  joined: new Date("2024-03-09T10:00:00Z"),
  notes: "prefers email",
};

test("writes a header and one row per customer", () => {
  assert.equal(
    customersToCsv([jane]),
    "id,name,email,phone,company,joined,notes\n" +
      "7,Jane Smith,jane@example.com,020 555 0100,Smith Bakery,2024-03-09,prefers email\n",
  );
});

test("an empty list is only the header", () => {
  assert.equal(customersToCsv([]), "id,name,email,phone,company,joined,notes\n");
});

import assert from "node:assert/strict";
import test from "node:test";

import { customersToCsv } from "../../src/exports/customers.mjs";
import { ordersToCsv } from "../../src/exports/orders.mjs";

const HEADER = "id,name,email,phone,company,joined,notes\n";

function customer(over) {
  return {
    id: 1,
    name: "Jane Smith",
    email: "jane@example.com",
    phone: "020 555 0100",
    company: "Smith Bakery",
    joined: new Date("2024-03-09T10:00:00Z"),
    notes: "none",
    ...over,
  };
}

// Minimal RFC 4180 reader, to check what a spreadsheet would see.
function parse(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }
  return rows;
}

test("a name with a comma is wrapped", () => {
  assert.equal(
    customersToCsv([customer({ name: "Smith, Jane" })]),
    HEADER + '1,"Smith, Jane",jane@example.com,020 555 0100,Smith Bakery,2024-03-09,none\n',
  );
});

test("every row keeps seven columns when fields hold commas, quotes and breaks", () => {
  const rows = parse(
    customersToCsv([
      customer({ id: 1, name: "Smith, Jane", company: 'Smith, "Best" Bakery, Ltd' }),
      customer({ id: 2, notes: "line one\nline two, with comma" }),
      customer({ id: 3, email: "a,b@example.com" }),
    ]),
  );
  assert.equal(rows.length, 4);
  for (const row of rows) assert.equal(row.length, 7);
  assert.equal(rows[1][1], "Smith, Jane");
  assert.equal(rows[1][4], 'Smith, "Best" Bakery, Ltd');
  assert.equal(rows[2][6], "line one\nline two, with comma");
});

test("a double quote inside a field is doubled", () => {
  assert.equal(
    customersToCsv([customer({ company: 'The "Best" Bakery' })]),
    HEADER + '1,Jane Smith,jane@example.com,020 555 0100,"The ""Best"" Bakery",2024-03-09,none\n',
  );
});

test("a line break inside a field is wrapped", () => {
  assert.equal(
    customersToCsv([customer({ notes: "call back\nafter 5" })]),
    HEADER + '1,Jane Smith,jane@example.com,020 555 0100,Smith Bakery,2024-03-09,"call back\nafter 5"\n',
  );
});

test("a name that a spreadsheet would run as a formula is neutralised", () => {
  assert.equal(
    customersToCsv([customer({ name: '=HYPERLINK("http://evil.example","Jane")' })]),
    HEADER +
      `1,"'=HYPERLINK(""http://evil.example"",""Jane"")",jane@example.com,020 555 0100,Smith Bakery,2024-03-09,none\n`,
  );
});

test("a phone number with a leading plus follows the same formula rule", () => {
  assert.equal(
    customersToCsv([customer({ phone: "+31 6 1234 5678" })]),
    HEADER + "1,Jane Smith,jane@example.com,'+31 6 1234 5678,Smith Bakery,2024-03-09,none\n",
  );
});

test("a missing company or note is empty, not the word null", () => {
  assert.equal(
    customersToCsv([customer({ company: null, notes: undefined })]),
    HEADER + "1,Jane Smith,jane@example.com,020 555 0100,,2024-03-09,\n",
  );
});

test("a name with edge whitespace is wrapped so it survives the spreadsheet", () => {
  assert.equal(
    customersToCsv([customer({ name: " Jane " })]),
    HEADER + '1," Jane ",jane@example.com,020 555 0100,Smith Bakery,2024-03-09,none\n',
  );
});

test("plain customers and the empty list are unchanged", () => {
  assert.equal(
    customersToCsv([customer({}), customer({ id: 2, name: "Bo Li" })]),
    HEADER +
      "1,Jane Smith,jane@example.com,020 555 0100,Smith Bakery,2024-03-09,none\n" +
      "2,Bo Li,jane@example.com,020 555 0100,Smith Bakery,2024-03-09,none\n",
  );
  assert.equal(customersToCsv([]), HEADER);
});

test("the orders export still writes a refund as -12.50", () => {
  assert.equal(
    ordersToCsv([{ id: 9, customerId: 1, status: "refunded", totalCents: -1250 }]),
    "id,customerId,status,total\n9,1,refunded,-12.50\n",
  );
});

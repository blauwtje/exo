import assert from "node:assert/strict";
import test from "node:test";

import { dumpAudit } from "../src/audit/dump.mjs";

test("dumps one line per event", () => {
  assert.equal(
    dumpAudit([{ at: new Date("2024-05-01T08:00:00Z"), actor: "ann", action: "login", target: null }]),
    "2024-05-01T08:00:00.000Z,ann,login,\n",
  );
});

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fetchPage } from "../skills/search/scripts/fetch.mjs";

process.env.EXO_SEARCH_DOMAIN_GAP_MS = "1";

test("two concurrent fetchPage calls for one url call fetchImpl once and the second reads the cache", async () => {
  const cacheDir = mkdtempSync(join(tmpdir(), "fetch-race-"));
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return new Response("<p>hello</p>", { status: 200, headers: { "content-type": "text/html" } });
  };
  const url = "https://race.example.com/page";
  const results = await Promise.all([fetchPage(url, { cacheDir, fetchImpl }), fetchPage(url, { cacheDir, fetchImpl })]);
  assert.equal(calls, 1);
  assert.deepEqual(results.map((result) => result.via).sort(), ["cache", "direct"]);
});

import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { mkdtempSync, readdirSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const FETCH = new URL("../skills/search/scripts/fetch.mjs", import.meta.url).pathname;

test("a saved page is reported fetched when its claim mark fails and other urls still finish", async () => {
  const dir = mkdtempSync(join(tmpdir(), "exo-fetch-mark-"));
  const server = createServer((request, response) => {
    if (request.url === "/a") {
      for (const name of readdirSync(join(dir, "claims"))) if (name.endsWith(".json")) unlinkSync(join(dir, "claims", name));
    }
    response.setHeader("content-type", "text/plain");
    response.end(`page ${request.url} `.repeat(200));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const { stdout } = await promisify(execFile)(process.execPath, [FETCH, "--run", dir, "Q1", `${base}/a`, `${base}/b`], {
      env: { ...process.env, EXO_SEARCH_DOMAIN_GAP_MS: "0" },
    });
    assert.match(stdout, new RegExp(`Fetched: ${base}/a `));
    assert.match(stdout, new RegExp(`Fetched: ${base}/b `));
    assert.doesNotMatch(stdout, /Failed/);
  } finally {
    server.close();
  }
});

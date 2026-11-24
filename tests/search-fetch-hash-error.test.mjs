import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const FETCH = new URL("../skills/search/scripts/fetch.mjs", import.meta.url).pathname;

const UNREADABLE_PAGES = `import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
const readFileSync = fs.readFileSync;
fs.readFileSync = (path, ...rest) => {
  if (String(path).endsWith(".md")) throw new Error("saved page unreadable");
  return readFileSync(path, ...rest);
};
syncBuiltinESMExports();
`;

test("every url gets a result line when a saved page cannot be read back for its claim hash", async () => {
  const dir = mkdtempSync(join(tmpdir(), "exo-fetch-hash-"));
  const preload = join(mkdtempSync(join(tmpdir(), "exo-fetch-hash-preload-")), "unreadable.mjs");
  writeFileSync(preload, UNREADABLE_PAGES);
  const server = createServer((request, response) => {
    response.setHeader("content-type", "text/plain");
    response.end(`page ${request.url} `.repeat(200));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const { stdout, stderr } = await promisify(execFile)(process.execPath, ["--import", preload, FETCH, "--run", dir, "Q1", `${base}/a`, `${base}/b`], {
      env: { ...process.env, EXO_SEARCH_DOMAIN_GAP_MS: "0" },
    });
    assert.match(stdout, new RegExp(`Fetched: ${base}/a `));
    assert.match(stdout, new RegExp(`Fetched: ${base}/b `));
    assert.match(stderr, /Claim mark failed: .*saved page unreadable/);
  } finally {
    server.close();
  }
});

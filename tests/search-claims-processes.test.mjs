import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const FETCH = fileURLToPath(new URL("../skills/search/scripts/fetch.mjs", import.meta.url));
const env = { ...process.env, EXO_SEARCH_DOMAIN_GAP_MS: "1" };

function run(dir, sub, url) {
  const child = spawn(process.execPath, [FETCH, "--run", dir, sub, url], { env });
  let output = "";
  child.stdout.on("data", (chunk) => (output += chunk));
  const exited = new Promise((resolve) => child.on("close", () => resolve(output)));
  return { exited };
}

test("two fetch processes on different subs make one request and the second prints Taken", async () => {
  const dir = mkdtempSync(join(tmpdir(), "claims-processes-"));
  let requests = 0;
  let firstRequest;
  const arrived = new Promise((resolve) => (firstRequest = resolve));
  let release;
  const released = new Promise((resolve) => (release = resolve));
  const server = createServer(async (request, response) => {
    requests += 1;
    firstRequest();
    await released;
    response.setHeader("content-type", "text/plain");
    response.end("page body");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${server.address().port}/page`;
  try {
    const first = run(dir, "Q1", url);
    await arrived;
    const second = await run(dir, "Q2", url).exited;
    release();
    const firstOutput = await first.exited;
    assert.equal(requests, 1);
    assert.equal(second.trim(), `Taken: ${url} (Q1)`);
    assert.match(firstOutput, /^Fetched: /);
  } finally {
    release();
    server.close();
  }
});

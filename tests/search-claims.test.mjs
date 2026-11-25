import test from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { claimSource, markClaim } from "../skills/search/scripts/claims.mjs";

const CLAIMS = new URL("../skills/search/scripts/claims.mjs", import.meta.url).pathname;
const URL_A = "https://example.com/a";
const runDir = () => mkdtempSync(join(tmpdir(), "claims-"));
const records = (dir) => readdirSync(join(dir, "claims")).filter((name) => name.endsWith(".json")).map((name) => JSON.parse(readFileSync(join(dir, "claims", name), "utf8")));

test("the first sub claims a url, another sub is told which sub holds it, the same sub claims again", () => {
  const dir = runDir();
  assert.deepEqual(claimSource(dir, URL_A, "Q1", { now: 0, leaseMs: 1000 }), { claimed: true });
  assert.deepEqual(claimSource(dir, URL_A, "Q2", { now: 1, leaseMs: 1000 }), { taken: "Q1" });
  assert.deepEqual(claimSource(dir, URL_A, "Q1", { now: 2, leaseMs: 1000 }), { claimed: true });
});

test("mirrors that fold to one canonical url share one claim", () => {
  const dir = runDir();
  claimSource(dir, "https://www.example.com/a/", "Q1", { now: 0 });
  assert.deepEqual(claimSource(dir, "http://example.com/a", "Q2", { now: 1 }), { taken: "Q1" });
});

test("a claim holds the canonical url, sha1, sub, pid and lease end", () => {
  const dir = runDir();
  claimSource(dir, "https://www.example.com/a/", "Q3", { now: 100, leaseMs: 50 });
  const [record] = records(dir);
  assert.deepEqual({ ...record, sha1: undefined }, { url: "example.com/a", sha1: undefined, sub: "Q3", pid: process.pid, leaseUntil: 150 });
  assert.match(record.sha1, /^[0-9a-f]{40}$/);
});

test("a claim with no lease is never taken over", () => {
  const dir = runDir();
  claimSource(dir, URL_A, "Q1", { now: 0 });
  assert.deepEqual(claimSource(dir, URL_A, "Q2", { now: 1e12, leaseMs: 1000 }), { taken: "Q1" });
});

test("a live claim holds until its lease ends, then another sub takes it over", () => {
  const dir = runDir();
  claimSource(dir, URL_A, "Q1", { now: 0, leaseMs: 1000 });
  assert.deepEqual(claimSource(dir, URL_A, "Q2", { now: 999, leaseMs: 1000 }), { taken: "Q1" });
  assert.deepEqual(claimSource(dir, URL_A, "Q2", { now: 1000, leaseMs: 1000 }), { claimed: true });
  assert.deepEqual(claimSource(dir, URL_A, "Q1", { now: 1001, leaseMs: 1000 }), { taken: "Q2" });
});

test("a failed claim stays held until its lease ends", () => {
  const dir = runDir();
  claimSource(dir, URL_A, "Q1", { now: 0, leaseMs: 1000 });
  markClaim(dir, URL_A, "Q1", { status: "failed" });
  assert.deepEqual(claimSource(dir, URL_A, "Q2", { now: 500, leaseMs: 1000 }), { taken: "Q1" });
  assert.deepEqual(claimSource(dir, URL_A, "Q2", { now: 1500, leaseMs: 1000 }), { claimed: true });
});

test("an ok claim keeps its sha256 and fetchedAt and is never taken over", () => {
  const dir = runDir();
  claimSource(dir, URL_A, "Q1", { now: 0, leaseMs: 1000 });
  markClaim(dir, URL_A, "Q1", { status: "ok", sha256: "abc", fetchedAt: "2026-01-01T00:00:00.000Z" });
  assert.deepEqual(claimSource(dir, URL_A, "Q2", { now: 5000, leaseMs: 1000 }), { taken: "Q1" });
  const [record] = records(dir);
  assert.equal(record.status, "ok");
  assert.equal(record.sha256, "abc");
  assert.equal(record.fetchedAt, "2026-01-01T00:00:00.000Z");
  assert.equal(record.sub, "Q1");
});

test("a summary claim is never taken over", () => {
  const dir = runDir();
  claimSource(dir, URL_A, "Q1", { now: 0, leaseMs: 1000 });
  markClaim(dir, URL_A, "Q1", { status: "summary" });
  assert.deepEqual(claimSource(dir, URL_A, "Q2", { now: 5000, leaseMs: 1000 }), { taken: "Q1" });
});

test("marking a url nobody claimed throws and names the url", () => {
  assert.throws(() => markClaim(runDir(), URL_A, "Q1", { status: "ok" }), /example\.com\/a/);
});

const TAKE_OVER = `
const [claims, dir, sub] = process.argv.slice(2);
const { claimSource } = await import(claims);
console.log("ready");
await new Promise((resolve) => process.stdin.once("data", resolve));
console.log(JSON.stringify(claimSource(dir, "https://example.com/a", sub, { now: 1e6, leaseMs: 1000 })));
`;

const takeOver = (dir, sub) => {
  const child = spawn(process.execPath, ["--input-type=module", "-e", TAKE_OVER, "takeover", CLAIMS, dir, sub]);
  let out = "";
  let err = "";
  let ready;
  const isReady = new Promise((resolve) => (ready = resolve));
  child.stdout.on("data", (chunk) => {
    out += chunk;
    if (out.includes("ready\n")) ready();
  });
  child.stderr.on("data", (chunk) => (err += chunk));
  const result = new Promise((resolve, reject) =>
    child.on("close", (code) => (code === 0 ? resolve(JSON.parse(out.replace("ready\n", ""))) : reject(new Error(err)))),
  );
  return { isReady, go: () => child.stdin.end("go\n"), result };
};

test("eight processes taking over one expired claim give exactly one winner", async () => {
  const dir = runDir();
  claimSource(dir, URL_A, "Q0", { now: 0, leaseMs: 1000 });
  const children = Array.from({ length: 8 }, (_, index) => takeOver(dir, `Q${index + 1}`));
  await Promise.all(children.map(({ isReady }) => isReady));
  children.forEach(({ go }) => go());
  const results = await Promise.all(children.map(({ result }) => result));
  const winners = results.filter((result) => result.claimed);
  assert.equal(winners.length, 1);
  const winner = `Q${results.indexOf(winners[0]) + 1}`;
  assert.deepEqual(results.filter((result) => result.taken).map((result) => result.taken), Array(7).fill(winner));
});

const summary = (dir, sub, url) => spawnSync(process.execPath, [CLAIMS, "summary", dir, sub, url], { encoding: "utf8" });

test("summary on the sub's own claim sets status summary", () => {
  const dir = runDir();
  claimSource(dir, URL_A, "Q1", { now: 0, leaseMs: 1000 });
  const result = summary(dir, "Q1", URL_A);
  assert.equal(result.status, 0);
  assert.equal(result.stdout, "");
  assert.deepEqual(records(dir).map(({ sub, status }) => ({ sub, status })), [{ sub: "Q1", status: "summary" }]);
});

test("summary on an unclaimed url claims it for the sub with status summary", () => {
  const dir = runDir();
  assert.equal(summary(dir, "Q2", URL_A).status, 0);
  assert.deepEqual(records(dir).map(({ sub, status }) => ({ sub, status })), [{ sub: "Q2", status: "summary" }]);
  assert.deepEqual(claimSource(dir, URL_A, "Q1", { now: 1e12, leaseMs: 1000 }), { taken: "Q2" });
});

test("summary on another sub's live claim prints Taken and changes nothing", () => {
  const dir = runDir();
  claimSource(dir, URL_A, "Q1", { now: 0, leaseMs: 1e13 });
  const result = summary(dir, "Q2", URL_A);
  assert.equal(result.stdout.trim(), `Taken: ${URL_A} (Q1)`);
  assert.deepEqual(records(dir).map(({ sub, status }) => ({ sub, status })), [{ sub: "Q1", status: undefined }]);
});

test("summary with a missing argument prints usage and exits 2", () => {
  const result = spawnSync(process.execPath, [CLAIMS, "summary", runDir(), "Q1"], { encoding: "utf8" });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /usage: claims\.mjs summary/);
});

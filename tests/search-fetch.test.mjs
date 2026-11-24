import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { fetchPage, htmlToText } from "../skills/search/scripts/fetch.mjs";
import { canonicalUrl } from "../skills/search/scripts/pick.mjs";

process.env.EXO_SEARCH_DOMAIN_GAP_MS = "1";
process.env.EXO_SEARCH_BACKOFF_MS = "1";

const script = fileURLToPath(new URL("../skills/search/scripts/fetch.mjs", import.meta.url));
const page = (body, type = "text/html; charset=utf-8", status = 200, headers = {}) =>
  new Response(body, { status, headers: { "content-type": type, ...headers } });
const dir = () => mkdtempSync(join(tmpdir(), "fetch-"));
const fileFor = (cacheDir, url) => join(cacheDir, `${createHash("sha1").update(canonicalUrl(url)).digest("hex")}.md`);

test("htmlToText drops chrome, decodes entities and keeps headings and paragraphs", () => {
  const text = htmlToText(
    "<html><head><style>p{}</style><script>var x=1</script></head><body><nav>Menu</nav><header>Top</header><h1>Title &amp; more</h1><p>First &lt;para&gt;&#33;</p><p>Second&nbsp;para</p><footer>Bye</footer></body></html>",
  );
  assert.match(text, /Title & more/);
  assert.match(text, /First <para>!\n\nSecond para/);
  assert.doesNotMatch(text, /Menu|Top|Bye|var x|p\{\}/);
});

test("a direct fetch is saved under the sha1 of the canonical url with a Source line, then read from cache", async () => {
  const cacheDir = dir();
  const url = "https://www.example.com/a/";
  let calls = 0;
  const fetchImpl = async () => (calls += 1, page("<p>Hello world</p>"));
  const first = await fetchPage(url, { cacheDir, fetchImpl });
  assert.equal(first.via, "direct");
  assert.equal(first.file, fileFor(cacheDir, "https://example.com/a"));
  assert.equal(readFileSync(first.file, "utf8").split("\n")[0], `Source: ${url}`);
  assert.match(readFileSync(first.file, "utf8"), /Hello world/);
  const second = await fetchPage("https://example.com/a", { cacheDir, fetchImpl });
  assert.equal(second.via, "cache");
  assert.equal(calls, 1);
});

test("plain text is kept as is", async () => {
  const cacheDir = dir();
  const result = await fetchPage("https://example.com/t.txt", { cacheDir, fetchImpl: async () => page("a <b> c", "text/plain") });
  assert.equal(readFileSync(result.file, "utf8"), "Source: https://example.com/t.txt\na <b> c");
});

test("429 and 5xx are retried twice, then the jina reader answers", async () => {
  const cacheDir = dir();
  const seen = [];
  const fetchImpl = async (url) => {
    seen.push(url);
    return url.startsWith("https://r.jina.ai/") ? page("reader text", "text/plain") : page("", "text/html", 503);
  };
  const result = await fetchPage("https://example.com/x", { cacheDir, fetchImpl });
  assert.equal(result.via, "jina");
  assert.deepEqual(seen, ["https://example.com/x", "https://example.com/x", "https://example.com/x", "https://r.jina.ai/https://example.com/x"]);
});

test("a retry succeeds after a 429 with Retry-After", async () => {
  const cacheDir = dir();
  let calls = 0;
  const fetchImpl = async () => (calls += 1) === 1 ? page("", "text/html", 429, { "retry-after": "0" }) : page("<p>ok</p>");
  const result = await fetchPage("https://example.com/r", { cacheDir, fetchImpl });
  assert.equal(result.via, "direct");
  assert.equal(calls, 2);
});

test("the wayback snapshot is the last fallback", async () => {
  const cacheDir = dir();
  const fetchImpl = async (url) => {
    if (url.startsWith("https://archive.org/wayback/available?url=")) {
      return page(JSON.stringify({ archived_snapshots: { closest: { url: "https://web.archive.org/web/1/https://example.com/w" } } }), "application/json");
    }
    if (url.startsWith("https://web.archive.org/")) return page("<p>archived</p>");
    return page("", "text/html", 404);
  };
  const result = await fetchPage("https://example.com/w", { cacheDir, fetchImpl });
  assert.equal(result.via, "wayback");
  assert.match(readFileSync(result.file, "utf8"), /archived/);
});

test("when every route fails the error names the url", async () => {
  await assert.rejects(fetchPage("https://example.com/z", { cacheDir: dir(), fetchImpl: async () => page("", "text/html", 404) }), /example\.com\/z/);
});

test("a request that exceeds the timeout falls through to the next route", async () => {
  const cacheDir = dir();
  process.env.EXO_SEARCH_FETCH_MS = "20";
  try {
    const fetchImpl = (url, { signal }) =>
      url.startsWith("https://r.jina.ai/")
        ? Promise.resolve(page("reader text", "text/plain"))
        : new Promise((_, reject) => signal.addEventListener("abort", () => reject(signal.reason)));
    const result = await fetchPage("https://example.com/slow", { cacheDir, fetchImpl });
    assert.equal(result.via, "jina");
  } finally {
    delete process.env.EXO_SEARCH_FETCH_MS;
  }
});

test("at most 2 requests per domain run at once and the lock slots are released", async () => {
  const cacheDir = dir();
  let active = 0;
  let peak = 0;
  const fetchImpl = async () => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 30));
    active -= 1;
    return page("<p>x</p>");
  };
  await Promise.all([1, 2, 3, 4, 5].map((n) => fetchPage(`https://example.com/p${n}`, { cacheDir, fetchImpl })));
  assert.equal(peak, 2);
  assert.deepEqual(readdirSync(join(cacheDir, "locks")).filter((name) => /-[01]$/.test(name)), []);
});

test("the CLI prints one line per url and exits 0 even when a url fails", () => {
  const run = spawnSync(process.execPath, [script, "--run", dir(), "not a url"], { encoding: "utf8" });
  assert.equal(run.status, 0);
  assert.match(run.stdout, /^Failed: not a url .*; use WebFetch$/m);
});

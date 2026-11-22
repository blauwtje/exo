import test from "node:test";
import assert from "node:assert/strict";
import { find } from "../skills/search/scripts/reddit.mjs";

const plan = {
  days: 30,
  subreddits: ["a", "b", "c", "d", "e"],
  subQuestions: Array.from({ length: 8 }, (_, index) => ({ ask: `q${index}`, terms: [`first${index}`, `second${index}`] })),
};

test("find searches each term once over all named subreddits and drops nothing", async () => {
  const urls = [];
  const { failed } = await find(plan, async (url) => urls.push(new URL(url)) && [{ url, title: "t", facts: "f" }]);
  assert.equal(urls.length, 24);
  assert.deepEqual(failed, []);
  const joined = urls.filter((url) => url.pathname !== "/search");
  assert.equal(joined.length, 16);
  assert.ok(joined.every((url) => url.pathname === "/r/a+b+c+d+e/search" && url.searchParams.get("restrict_sr") === "on"));
  assert.equal(new Set(joined.map((url) => url.searchParams.get("q"))).size, 16);
  assert.equal(urls.filter((url) => url.pathname === "/search").length, 8);
});

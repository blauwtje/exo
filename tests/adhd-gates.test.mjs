import { test } from "node:test";
import assert from "node:assert/strict";
import { gateReply } from "../benchmarks/adhd/gates.mjs";

const c = { literals: [["10%", "10 %"], ["5x"]], lead: ["no", "nee"] };
const good = "No, the style is cached at 10% of input price. Output costs 5x input.";

test("a clean reply passes", () => {
  assert.deepEqual(gateReply(good, c), { pass: true, failed: [] });
});

test("a literal variant is accepted", () => {
  assert.equal(gateReply(good.replace("10%", "10 %"), c).pass, true);
});

test("a missing literal fails", () => {
  assert.deepEqual(gateReply("No, it is cheap. Output costs 5x input.", c).failed, ["literals"]);
});

test("a lead key missing from the first sentence fails", () => {
  assert.deepEqual(gateReply("Cached at 10% of price. No, 5x output.", c).failed, ["lead"]);
  assert.equal(gateReply("Know it: 10% and 5x.", c).failed.includes("lead"), true);
});

test("a case without lead keys skips the lead gate", () => {
  assert.equal(gateReply(good, { ...c, lead: [] }).pass, true);
});

test("a heading fails", () => {
  assert.deepEqual(gateReply(`## Answer\n${good}`, { ...c, lead: [] }).failed, ["heading"]);
});

test("an opening line fails", () => {
  assert.deepEqual(gateReply(`Sure! ${good}`, { ...c, lead: [] }).failed, ["opener"]);
});

test("a closing recap fails", () => {
  assert.deepEqual(gateReply(`${good} In short, it is cached.`, c).failed, ["recap"]);
});

test("an opener word inside a longer word is not an opener", () => {
  assert.equal(gateReply("Illegal escape in line 3.", { literals: [], lead: [] }).pass, true);
  assert.deepEqual(gateReply("Sure, here you go.", { literals: [], lead: [] }).failed, ["opener"]);
});

test("a # comment inside a fenced block is not a heading", () => {
  const reply = "Run:\n```sh\n# install deps\nnpm ci\n```";
  assert.equal(gateReply(reply, { literals: [], lead: [] }).pass, true);
  assert.deepEqual(gateReply("# Title\nbody", { literals: [], lead: [] }).failed, ["heading"]);
});

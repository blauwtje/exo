const OPENER = /^(sure|certainly|of course|great question|good question|absolutely|happy to|i'?ll|i will|let me|here'?s|here is|okay|ok|alright|sure thing)\b/i;
const RECAP = /^(in (short|summary|conclusion|sum)|to (summarize|sum up|recap)|summary|overall|all in all|let me know|hope this|feel free)/i;
const WORD = "[\\p{L}\\p{N}]";

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const hasKey = (text, key) =>
  new RegExp(`(?<!${WORD})${escape(key)}(?!${WORD})`, "iu").test(text);

function firstSentence(reply) {
  const text = reply.trim();
  const end = text.search(/[.!?](\s|$)|\n/);
  return end < 0 ? text : text.slice(0, end + 1);
}

function lastSentence(reply) {
  const parts = reply.trim().split(/(?<=[.!?])\s+|\n+/).filter(Boolean);
  return parts.length > 1 ? parts.at(-1) : "";
}

function outsideFences(reply) {
  let open = null;
  return reply.split("\n").filter((line) => {
    const fence = /^\s{0,3}(`{3,}|~{3,})/.exec(line)?.[1];
    if (open === null) { open = fence ?? null; return fence === undefined; }
    if (fence && fence[0] === open[0] && fence.length >= open.length) open = null;
    return false;
  }).join("\n");
}

function closesOnQuestion(reply, ask) {
  const prose = outsideFences(reply).replace(/`[^`]*`/g, "");
  const last = prose.lastIndexOf("?");
  return last < 0 ? !ask : /^[\s*]*$/.test(prose.slice(last + 1));
}

function unwrapFence(text) {
  return /^(`{3,}|~{3,})[^\n]*\n([\s\S]*)\n\1[`~]*$/.exec(text)?.[2] ?? text;
}

const GATES = {
  literals: (reply, c) =>
    (c.literals ?? []).every((variants) => variants.some((v) => reply.includes(v))),
  lead: (reply, c) =>
    !c.lead?.length || c.lead.some((k) => hasKey(firstSentence(reply), k)),
  heading: (reply) => !/^\s{0,3}#{1,6}\s/m.test(outsideFences(reply)),
  opener: (reply) => !OPENER.test(reply.trim()),
  recap: (reply) => !RECAP.test(lastSentence(reply)),
  question: (reply, c) => closesOnQuestion(reply, c.ask === true),
  deliverable: (reply, c) =>
    c.deliverable === undefined || new RegExp(c.deliverable).test(unwrapFence(reply.trim())),
};

export function gateReply(reply, testCase) {
  const failed = Object.keys(GATES).filter((name) => !GATES[name](reply, testCase));
  return { pass: failed.length === 0, failed };
}

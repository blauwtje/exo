import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { canonicalUrl, claimOwner } from "./claims.mjs";

const DAY_MS = 86400000;
const SHINGLE_WORDS = 5;
const DUPLICATE_JACCARD = 0.8;

const urlKey = (url) => createHash("sha1").update(canonicalUrl(url)).digest("hex");
const domainOf = (url) => new URL(url).hostname.replace(/^www\./, "");
const rrfTerm = (item) => 1 / (60 + item.listRank + 1);

function numericSignals(signals = {}) {
  return Object.entries(signals).filter(([, value]) => Number.isFinite(Number(value)) && value !== null && value !== "");
}

function maxPerSourceSignal(items) {
  const maxima = new Map();
  for (const item of items)
    for (const [name, value] of numericSignals(item.signals)) {
      const key = `${item.source}\u0000${name}`;
      maxima.set(key, Math.max(maxima.get(key) ?? 0, Number(value)));
    }
  return maxima;
}

function mergeByUrl(items) {
  const maxima = maxPerSourceSignal(items);
  const merged = new Map();
  for (const item of items) {
    const key = urlKey(item.url);
    const engagement = Object.fromEntries(
      numericSignals(item.signals).map(([name, value]) => {
        const top = maxima.get(`${item.source}\u0000${name}`);
        return [name, top > 0 && Number(value) > 0 ? Math.log1p(Number(value)) / Math.log1p(top) : 0];
      }),
    );
    const known = merged.get(key);
    if (!known) {
      merged.set(key, { ...item, rrf: rrfTerm(item), signals: { ...item.signals }, engagement, sources: [item.source], subs: [item.sub] });
      continue;
    }
    known.rrf += rrfTerm(item);
    known.signals = { ...item.signals, ...known.signals };
    for (const [name, value] of Object.entries(engagement)) known.engagement[name] = Math.max(known.engagement[name] ?? 0, value);
    known.primary ||= item.primary;
    known.date ||= item.date;
    if (!known.sources.includes(item.source)) known.sources.push(item.source);
    if (!known.subs.includes(item.sub)) known.subs.push(item.sub);
    if ((item.quote ?? "").length > (known.quote ?? "").length) known.quote = item.quote;
  }
  return [...merged.values()];
}

function scoreOf(item, halfLifeDays, now) {
  const time = item.date ? Date.parse(item.date) : NaN;
  const ageDays = Number.isFinite(time) ? Math.max(0, (now - time) / DAY_MS) : 0;
  const recency = 0.5 ** (ageDays / halfLifeDays);
  const values = Object.values(item.engagement);
  const engagement = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
  return item.rrf * recency * (1 + engagement) * (item.primary ? 1.25 : 1);
}

function shingles(text = "") {
  const words = text.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return new Set();
  if (words.length <= SHINGLE_WORDS) return new Set([words.join(" ")]);
  const set = new Set();
  for (let index = 0; index + SHINGLE_WORDS <= words.length; index++)
    set.add(createHash("sha1").update(words.slice(index, index + SHINGLE_WORDS).join(" ")).digest("hex"));
  return set;
}

function jaccard(a, b) {
  let shared = 0;
  for (const value of a) if (b.has(value)) shared++;
  return shared / (a.size + b.size - shared);
}

function dropNearDuplicates(sorted) {
  const kept = [];
  const dropped = [];
  for (const item of sorted) {
    const set = shingles(item.quote);
    const twin = set.size ? kept.find((other) => jaccard(set, other.set) >= DUPLICATE_JACCARD) : undefined;
    if (twin) dropped.push({ ...item, reason: `near-duplicate quote of ${twin.item.url}` });
    else kept.push({ item, set });
  }
  return { kept: kept.map(({ item }) => item), dropped };
}

function diversify(sorted) {
  const maxScore = sorted[0]?.score || 1;
  const remaining = [...sorted];
  const picked = [];
  const domains = new Map();
  const subs = new Map();
  while (remaining.length) {
    const share = (counts, key) => (picked.length ? (counts.get(key) ?? 0) / picked.length : 0);
    let best = 0;
    let bestValue = -Infinity;
    remaining.forEach((item, index) => {
      const crowding = Math.max(share(domains, domainOf(item.url)), share(subs, item.sub));
      const value = 0.7 * (item.score / maxScore) - 0.3 * crowding;
      if (value > bestValue) {
        best = index;
        bestValue = value;
      }
    });
    const [item] = remaining.splice(best, 1);
    picked.push(item);
    domains.set(domainOf(item.url), (domains.get(domainOf(item.url)) ?? 0) + 1);
    subs.set(item.sub, (subs.get(item.sub) ?? 0) + 1);
  }
  return picked;
}

export function rank(items, { halfLifeDays = 365, now = Date.now(), subs } = {}) {
  const scored = mergeByUrl(items)
    .map((item) => ({ ...item, score: scoreOf(item, halfLifeDays, now) }))
    .sort((a, b) => b.score - a.score);
  const { kept, dropped } = dropNearDuplicates(scored);
  const ranked = diversify(kept).map((item, index) => ({ ...item, id: `E${index + 1}` }));
  const count = subs ?? Math.max(0, ...items.map((item) => Number(item.sub.slice(1))));
  const counts = Object.fromEntries(Array.from({ length: count }, (_, index) => [`Q${index + 1}`, 0]));
  for (const item of ranked) for (const sub of item.subs) if (sub in counts) counts[sub]++;
  const uncovered = Object.keys(counts).filter((sub) => counts[sub] === 0);
  return { ranked, dropped, coverage: { counts, uncovered } };
}

export function sourceTable({ ranked, coverage }) {
  const rows = ranked.map((item) => `| ${item.id} | ${item.title.replace(/\|/g, "\\|")} | ${item.url} | ${item.sources.join(", ")} | ${item.score.toFixed(4)} |`);
  const gaps = coverage.uncovered.map((sub) => `Uncovered: ${sub}`);
  return ["| id | title | link | source | score |", "| --- | --- | --- | --- | --- |", ...rows, "", ...gaps].join("\n");
}

function flag(argv, name) {
  const at = argv.indexOf(name);
  return at === -1 ? undefined : argv[at + 1];
}

function parseEvidenceLine(line) {
  try {
    return JSON.parse(line) ?? {};
  } catch (error) {
    return { error: error.message };
  }
}

const subOfToken = (token) => token.replace(/b$/, "");

function readEvidence(dir) {
  return readdirSync(dir)
    .filter((name) => /^evidence-.*\.jsonl$/.test(name))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map((name) => ({
      name,
      sub: subOfToken(`Q${name.slice("evidence-".length, -".jsonl".length)}`),
      lines: readFileSync(join(dir, name), "utf8")
        .split("\n")
        .flatMap((line, index) => {
          if (!line) return [];
          const item = parseEvidenceLine(line);
          if (typeof item.url === "string" && typeof item.sub === "string") return [{ line, item }];
          console.log(`Skipped: ${name} line ${index + 1}: ${item.error ?? "no url or sub"}`);
          return [{ line }];
        }),
    }));
}

function giveEachUrlOneSub(dir, files) {
  const found = new Map();
  for (const { sub, lines } of files)
    for (const { item } of lines) {
      if (!item) continue;
      const key = canonicalUrl(item.url);
      if (!found.has(key)) found.set(key, { url: item.url, subs: new Set() });
      found.get(key).subs.add(sub);
    }
  const owners = new Map(
    [...found].map(([key, { url, subs }]) => {
      const claimer = subs.size > 1 ? subOfToken(claimOwner(dir, url) ?? "") : "";
      return [key, subs.has(claimer) ? claimer : [...subs][0]];
    }),
  );
  const taken = new Set();
  const kept = files.map((file) => {
    const lines = file.lines.filter(({ item }) => {
      const owner = item && owners.get(canonicalUrl(item.url));
      if (!owner || owner === file.sub) return true;
      taken.add(`Taken: ${item.url} (${owner})`);
      return false;
    });
    if (lines.length < file.lines.length) writeFileSync(join(dir, file.name), lines.map(({ line }) => `${line}\n`).join(""));
    return { ...file, lines };
  });
  for (const line of taken) console.log(line);
  return kept;
}

function main(argv) {
  const dir = flag(argv, "--run");
  if (!dir) throw new Error("rank.mjs needs --run <dir>");
  const items = giveEachUrlOneSub(dir, readEvidence(dir)).flatMap(({ lines }) => lines.flatMap(({ item }) => (item ? [item] : [])));
  const halfLife = flag(argv, "--half-life");
  const subs = flag(argv, "--subs");
  const result = rank(items, {
    ...(halfLife && { halfLifeDays: Number(halfLife) }),
    ...(subs && { subs: Number(subs) }),
  });
  writeFileSync(join(dir, "ranked.json"), JSON.stringify(result, null, 2));
  console.log(sourceTable(result));
  console.log(`Sources read: ${result.ranked.length + result.dropped.length}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2));

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { environmentMs } from "#script-flags";
import { canonicalUrl, claimSource, markQuietly } from "./claims.mjs";

function pickInput(prompt, plan, header, items) {
  const asks = plan.subQuestions.map(({ ask }, index) => `Q${index + 1} ${ask}`);
  const lines = items.map((item) =>
    prompt === "judge"
      ? `[${item.id}] ${item.title} | ${item.facts} | ${item.url}`
      : `[${item.id}] ${item.label} parent=${item.parent ?? "-"}\n${item.body}`,
  );
  return [`Question: ${plan.question}`, ...asks, "", header, "", ...lines].join("\n");
}

const entities = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

export function plainText(html) {
  return html
    .replace(/<\/?p>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (match, name) => {
      if (name[0] !== "#") return entities[name.toLowerCase()] ?? match;
      return String.fromCodePoint(name[1].toLowerCase() === "x" ? parseInt(name.slice(2), 16) : Number(name.slice(1)));
    })
    .trim();
}

export async function fetchOk(name, url, fetcher, headers = {}) {
  const response = await fetcher(url, { headers, signal: AbortSignal.timeout(environmentMs("EXO_SEARCH_FETCH_MS", 15000)) });
  if (!response.ok) throw new Error(`${name} answered ${response.status} for ${url}`);
  return response;
}

const children = new Set();

export function killChildren() {
  children.forEach((child) => child.kill());
}

function runClaude(args, input) {
  return new Promise((resolve, reject) => {
    const child = spawn("claude", args, { stdio: ["pipe", "pipe", "pipe"] });
    children.add(child);
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", (error) => reject(new Error(`Could not run claude: ${error.message}`)));
    child.on("close", (code) => {
      children.delete(child);
      if (code === 0) return resolve(stdout);
      reject(new Error(`claude exited ${code}: ${(stderr || stdout).trim()}`));
    });
    child.stdin.end(input);
  });
}

export function parseAnswer(stdout, schema) {
  const { result, structured_output: structured, is_error: isError } = JSON.parse(stdout);
  if (isError) throw new Error(`claude failed: ${result}`);
  if (schema) {
    if (structured === undefined) throw new Error(`claude answered no structured output: ${stdout.slice(0, 200)}`);
    return structured;
  }
  if (typeof result !== "string") throw new Error(`claude answered no text: ${stdout.slice(0, 200)}`);
  return result;
}

export async function ask({ model, system, tools = "", schema, maxTurns }, input) {
  const args = [
    "-p", "--model", model, "--tools", tools, "--strict-mcp-config", "--setting-sources", "",
    "--system-prompt", system, "--output-format", "json", "--no-session-persistence",
  ];
  if (tools) args.push("--allowedTools", tools);
  if (schema) args.push("--json-schema", JSON.stringify(schema));
  if (maxTurns) args.push("--max-turns", String(maxTurns));
  return parseAnswer(await runClaude(args, input), schema);
}

const PICK_LINE = /^\W*([\w-]+)\W*?:\s*(.*)$/;

export function parsePicks(text, ids) {
  const picks = new Map();
  for (const line of text.split("\n")) {
    const match = line.match(PICK_LINE);
    if (!match || !ids.has(match[1]) || picks.has(match[1])) continue;
    picks.set(match[1], { id: match[1], reason: match[2].trim() });
  }
  return [...picks.values()];
}

const bodyOnly = (items) => items.length === 1 && items[0].id === "body";

function parseBodyPick(text) {
  const match = text.split("\n").map((line) => line.match(PICK_LINE)).find(Boolean);
  return match ? [{ id: "body", reason: match[2].trim() }] : [];
}

export async function pick(prompt, plan, header, items) {
  const system = await readFile(new URL(`../references/${prompt}.md`, import.meta.url), "utf8");
  const result = await ask({ model: "haiku", system }, pickInput(prompt, plan, header, items));
  const picks = bodyOnly(items) ? parseBodyPick(result) : parsePicks(result, new Set(items.map((item) => item.id)));
  if (!picks.length && result.trim()) throw new Error(`claude answered no pick line for the ${prompt}: ${result.slice(0, 200)}`);
  return picks;
}

const JUDGE_BATCH = 60;
const RANK_OFFSET = 60;
const MAX_READS = 8;
const READS_PER_SUBQUESTION = 3;
const MAX_DOCUMENT_CHARS = 12000;
const TOTAL_CHARS = 60000;

export async function searchAll(searches) {
  const settled = await Promise.allSettled(searches.map(({ cards }) => cards));
  const lists = [];
  const failed = [];
  settled.forEach((outcome, index) => {
    if (outcome.status === "rejected") return failed.push(`search failed: ${outcome.reason.message}`);
    lists.push(outcome.value);
    if (!outcome.value.length) failed.push(`no hits: ${searches[index].label}`);
  });
  return { lists, failed };
}

export function fuse(lists, skip) {
  const skipped = new Set([...skip].map(canonicalUrl));
  const merged = new Map();
  for (const list of lists) {
    list.forEach((card, index) => {
      const key = canonicalUrl(card.url);
      if (skipped.has(key)) return;
      const entry = merged.get(key) ?? { card, score: 0 };
      entry.score += 1 / (RANK_OFFSET + index + 1);
      merged.set(key, entry);
    });
  }
  return [...merged.values()]
    .sort((a, b) => b.score - a.score)
    .map(({ card }, index) => ({ ...card, id: `c${index + 1}` }));
}

function subQuestionsOf(reason) {
  const lead = reason.match(/^(?:Q\d+\W*)+/)?.[0] ?? "";
  return [...lead.matchAll(/Q(\d+)/g)].map((match) => Number(match[1]));
}

async function readCard(plan, { open }, choose, card, budget) {
  const { header, passages } = await open(card);
  const items = [{ id: "body", label: "body", parent: null, body: header }, ...passages];
  const answered = await choose("pick", plan, header, items);
  const picks = answered.filter(({ reason }) => subQuestionsOf(reason).length > 0);
  if (!picks.length) return null;
  const subs = [...new Set(picks.flatMap(({ reason }) => subQuestionsOf(reason)))].sort((a, b) => a - b);
  const bodyPick = picks.find(({ id }) => id === "body");
  const passagePicks = picks.filter(({ id }) => id !== "body");
  const rendered = render(header, passagePicks.length ? passages : [], passagePicks, budget);
  const withWhy = bodyPick ? `${rendered}\n\nwhy: ${bodyPick.reason}` : rendered;
  const text = Object.keys(card.signals ?? {}).length ? `${withWhy}\n\nSignals: ${JSON.stringify(card.signals)}` : withWhy;
  return { url: card.url, text, subs };
}

async function judgeNext(plan, choose, state, result) {
  const batch = state.cards.slice(state.judged, state.judged + JUDGE_BATCH);
  state.judged += batch.length;
  try {
    const chosen = await choose("judge", plan, "Candidate pages:", batch);
    const ids = new Set(batch.map(({ id }) => id));
    state.queue.push(...chosen.map(({ id }) => id).filter((id) => ids.has(id) && !state.queue.includes(id)));
  } catch (error) {
    result.failed.push(`judge failed: ${error.message}`);
  }
}

async function readClaimed({ run, sub }, { url }, read) {
  if (run === undefined || sub === undefined) return read();
  const leaseMs = environmentMs("EXO_SEARCH_URL_BUDGET_MS", 45000) + environmentMs("EXO_SEARCH_FETCH_MS", 15000);
  if (claimSource(run, url, sub, { leaseMs }).taken) return null;
  let value;
  try {
    value = await read();
  } catch (error) {
    markQuietly(run, url, sub, () => ({ status: "failed", leaseUntil: Date.now() }));
    throw error;
  }
  const fieldsOf = value ? () => ({ status: "ok", leaseUntil: null, sha256: createHash("sha256").update(value.text).digest("hex") }) : () => ({ leaseUntil: Date.now() });
  return markQuietly(run, url, sub, fieldsOf) === false ? null : value;
}

export async function readBest(plan, { find, open }, choose = pick, state = null, limit = Infinity) {
  const result = { read: [], found: 0, failed: [], state: null, done: false };
  if (!state) {
    const searched = await find(plan);
    result.failed.push(...searched.failed);
    state = { cards: fuse(searched.lists, plan.skip), judged: 0, queue: [] };
  }
  const next = { cards: state.cards, judged: state.judged, queue: [...state.queue] };
  const cap = Math.min(MAX_READS, READS_PER_SUBQUESTION * plan.subQuestions.length);
  const callCap = Math.min(cap, limit);
  const threadSources = Math.max(1, plan.sources.length);
  const budget = Math.min(MAX_DOCUMENT_CHARS, Math.floor(TOTAL_CHARS / (threadSources * cap)));
  while (next.queue.length < callCap && next.judged < next.cards.length) await judgeNext(plan, choose, next, result);
  const byId = new Map(next.cards.map((card) => [card.id, card]));
  const ids = next.queue.splice(0, callCap);
  const settled = await Promise.allSettled(
    ids.map((id) => readClaimed(plan, byId.get(id), () => readCard(plan, { open }, choose, byId.get(id), budget))),
  );
  settled.forEach((outcome, index) => {
    if (outcome.status === "rejected") return result.failed.push(`${byId.get(ids[index]).url} failed: ${outcome.reason.message}`);
    if (outcome.value) result.read.push(outcome.value);
  });
  result.found = next.cards.length;
  result.state = next;
  result.done = (!next.queue.length && next.judged >= next.cards.length);
  return result;
}

function formatComment(comment, depth) {
  const indent = "  ".repeat(depth);
  const score = comment.score === null ? "" : ` (${comment.score})`;
  const body = comment.body.replace(/^/gm, `${indent}  `);
  return `${indent}[${comment.id}] ${comment.label}${score} ${comment.link}\n${body}`;
}

function fullBlocks(byId, printed, { id, reason }) {
  const alreadyPrinted = printed.has(id);
  const chain = [];
  for (let comment = byId.get(id); comment; comment = byId.get(comment.parent)) chain.unshift(comment);
  const blocks = [];
  chain.forEach((comment, depth) => {
    if (printed.has(comment.id)) return;
    printed.add(comment.id);
    blocks.push(formatComment(comment, depth));
  });
  const owner = alreadyPrinted ? `[${id}] ${byId.get(id).label} ` : "";
  blocks.push(`${"  ".repeat(chain.length - 1)}  ${owner}why: ${reason}`);
  return blocks;
}

function summaryLine(byId, { id, reason }) {
  const comment = byId.get(id);
  return `[${id}] ${comment.label} ${comment.link} why: ${reason}`;
}

const HEADER_FIXED_LINES = 3;

function cutHeader(header, budget, hasComments) {
  const lines = header.split("\n");
  const fixed = lines.slice(0, HEADER_FIXED_LINES).join("\n");
  const rest = lines.slice(HEADER_FIXED_LINES).join("\n");
  const room = (hasComments ? Math.floor(budget / 3) : budget) - fixed.length - 1;
  if (!rest || room <= 0) return fixed;
  if (rest.length <= room) return `${fixed}\n${rest}`;
  const cut = rest.slice(0, room + 1).replace(/\s*\S*$/, "");
  return cut ? `${fixed}\n${cut}` : fixed;
}

export function render(header, comments, picks, budget = 30000) {
  const byId = new Map(comments.map((comment) => [comment.id, comment]));
  const printed = new Set();
  const summaries = picks.map((pick) => summaryLine(byId, pick));
  const head = cutHeader(header, budget, comments.length > 0 || picks.length > 0);
  const blocks = [head];
  const tails = summaries.map((_, index) => summaries.slice(index + 1).reduce((sum, line) => sum + line.length + 2, 0));
  let length = head.length;
  let full = true;
  picks.forEach((pick, index) => {
    if (full) {
      const seen = new Set(printed);
      const next = fullBlocks(byId, seen, pick);
      const added = next.reduce((sum, block) => sum + block.length + 2, 0);
      if (length + added + tails[index] <= budget) {
        blocks.push(...next);
        length += added;
        seen.forEach((id) => printed.add(id));
        return;
      }
      full = false;
    }
    blocks.push(summaries[index]);
  });
  return blocks.join("\n\n");
}

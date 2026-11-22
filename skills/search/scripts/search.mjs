import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { environmentMs, isMain, parseFlags, UsageError, USAGE_EXIT } from "#script-flags";
import { killChildren } from "./pick.mjs";
import * as github from "./github.mjs";
import * as hn from "./hn.mjs";
import * as reddit from "./reddit.mjs";
import * as web from "./web.mjs";

export const adapters = { reddit, github, hn, web };

const DEFAULT_DAYS = 365;
const DAY_MS = 86400000;
const MAX_TERMS = 2;
const MIN_TERM_WORDS = 2;
const MAX_TERM_WORDS = 4;
const SUBREDDIT = /^[A-Za-z0-9_]{2,21}$/;
const TOPIC = /^[a-z0-9][a-z0-9-]*$/;
const MAX_DEADLINE_MS = 290000;
const SCRIPT = fileURLToPath(import.meta.url);
const RUNS_DIR = join(tmpdir(), "search-runs");

export function deadlineMs() {
  return Math.min(environmentMs("EXO_SEARCH_DEADLINE_MS", 240000), MAX_DEADLINE_MS);
}

function requireReads(reads) {
  if (reads === undefined) return null;
  if (!Number.isInteger(reads) || reads < 1) throw new Error("Plan reads must be a whole number of at least 1");
  return reads;
}

function requireSubQuestions(subQuestions) {
  if (!Array.isArray(subQuestions) || !subQuestions.length) throw new Error("Plan needs at least one sub-question");
  subQuestions.forEach(({ ask, terms }, index) => {
    if (!ask || !Array.isArray(terms) || !terms.length) throw new Error(`Sub-question Q${index + 1} needs an ask and terms`);
    if (terms.length > MAX_TERMS) throw new Error(`Sub-question Q${index + 1} has more than ${MAX_TERMS} terms`);
    const loose = terms.find((term) => typeof term !== "string");
    if (loose !== undefined) throw new Error(`Sub-question Q${index + 1} term is not a string: ${loose}`);
    const short = terms.find((term) => term.trim().split(/\s+/).length < MIN_TERM_WORDS);
    if (short !== undefined) throw new Error(`Sub-question Q${index + 1} term has fewer than ${MIN_TERM_WORDS} words: ${short}`);
    const wordy = terms.find((term) => term.trim().split(/\s+/).length > MAX_TERM_WORDS);
    if (wordy !== undefined) throw new Error(`Sub-question Q${index + 1} term has more than ${MAX_TERM_WORDS} words: ${wordy}`);
  });
}

function requireSources(sources) {
  if (!Array.isArray(sources) || !sources.length) throw new Error("Plan sources must be a non-empty array");
  const repeated = sources.find((source, index) => sources.indexOf(source) !== index);
  if (repeated) throw new Error(`Duplicate source: ${repeated}`);
}

function requireDays(days, today) {
  if (!Number.isInteger(days) || days < 1) throw new Error("Plan days must be a whole number of at least 1");
  if (Number.isNaN(new Date(today.getTime() - days * DAY_MS).getTime())) throw new Error(`Plan days is too large: ${days}`);
}

function requireNames(field, label, names, pattern) {
  if (!Array.isArray(names)) throw new Error(`Plan ${field} must be an array`);
  const bad = names.find((name) => typeof name !== "string" || !pattern.test(name));
  if (bad !== undefined) throw new Error(`Plan ${label} is not valid: ${bad}`);
}

function requireSkip(skip) {
  if (!Array.isArray(skip)) throw new Error("Plan skip must be an array of urls");
  const relative = skip.find((url) => typeof url !== "string" || !URL.canParse(url));
  if (relative !== undefined) throw new Error(`Skip entry is not an absolute url: ${relative}`);
}

export function parsePlan(text, today = new Date()) {
  const raw = JSON.parse(text);
  if (typeof raw.question !== "string" || !raw.question.trim()) throw new Error("Plan needs a question");
  const sources = raw.sources ?? Object.keys(adapters);
  requireSources(sources);
  const unknown = sources.find((source) => !Object.hasOwn(adapters, source));
  if (unknown) throw new Error(`Unknown source: ${unknown}. Valid: ${Object.keys(adapters).join(", ")}`);
  requireSubQuestions(raw.subQuestions);
  const skip = raw.skip ?? [];
  requireSkip(skip);
  const reads = requireReads(raw.reads);
  const days = raw.days === undefined ? DEFAULT_DAYS : raw.days;
  requireDays(days, today);
  const subreddits = raw.subreddits ?? [];
  requireNames("subreddits", "subreddit", subreddits, SUBREDDIT);
  const topics = raw.topics ?? [];
  requireNames("topics", "topic", topics, TOPIC);
  return {
    reads,
    question: raw.question,
    sources,
    days,
    since: new Date(today.getTime() - days * DAY_MS).toISOString().slice(0, 10),
    subreddits,
    topics,
    subQuestions: raw.subQuestions,
    skip: new Set(skip),
  };
}

function section(source, result) {
  if (result.status === "rejected") return `## ${source}: failed\n\n${result.reason.message}`;
  const { read, found, failed } = result.value;
  return [`## ${source}: ${read.length} read, ${found} found`, ...failed, ...read.map(({ text }) => text)].join("\n\n");
}

export function limits(remaining, count) {
  if (!Number.isFinite(remaining)) return Array(count).fill(Infinity);
  const share = Math.floor(remaining / count);
  const extra = remaining % count;
  return Array.from({ length: count }, (_, index) => share + (index < extra ? 1 : 0));
}

export function newRun(rawPlan) {
  return { plan: rawPlan, read: 0, covered: [], states: {}, done: [], failed: [] };
}

function withDeadline(promise, deadline) {
  let timer;
  const expiry = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out after ${deadline / 1000} s`)), deadline);
  });
  return Promise.race([promise, expiry]).finally(() => clearTimeout(timer));
}

export async function advance(plan, run, deadline = deadlineMs()) {
  const pending = plan.sources.filter((source) => !run.done.includes(source));
  const remaining = plan.reads === null ? Infinity : plan.reads - run.read;
  const shares = limits(remaining, pending.length);
  const turns = pending.map((source, index) => ({ source, limit: shares[index] })).filter(({ limit }) => limit > 0);
  const settled = await Promise.allSettled(turns.map(({ source, limit }) => withDeadline(adapters[source].collect(plan, run.states[source] ?? null, limit), deadline)));
  const results = plan.sources.map(() => null);
  turns.forEach(({ source }, index) => {
    const result = settled[index];
    results[plan.sources.indexOf(source)] = result;
    if (result.status === "rejected") return void (run.done.push(source), run.failed.push(source));
    const { read, state, done } = result.value;
    run.read += read.length;
    run.covered = [...new Set([...run.covered, ...read.flatMap(({ subs }) => subs)])];
    run.states[source] = state;
    if (done) run.done.push(source);
  });
  return results;
}

function endLine(plan, run, file) {
  const status = `read ${run.read} of ${plan.reads}`;
  if (run.read >= plan.reads) return `Done: ${status}.`;
  if (plan.sources.every((source) => run.done.includes(source))) return `Stopped: ${status}, ${run.failed.length ? `failed: ${run.failed.join(", ")}` : "no candidates left"}.`;
  return `More: ${status}. Continue: node "${SCRIPT}" --continue "${file}"`;
}

function reportLines(plan, results) {
  return plan.sources.flatMap((source, index) => {
    const result = results[index];
    if (!result) return [];
    if (result.status === "rejected") return [`${source}: failed: ${result.reason.message}`];
    return result.value.failed;
  });
}

export function bundlePath(file) {
  return file.replace(/(\.json)?$/, ".md");
}

export function bundle(plan, results, run = null, file = null) {
  const asks = plan.subQuestions.map(({ ask }, index) => `Q${index + 1} ${ask}`);
  const covered = new Set(run ? run.covered : results.flatMap((result) => (result?.status === "fulfilled" ? result.value.read.flatMap(({ subs }) => subs) : [])));
  const uncovered = plan.subQuestions.map((_, index) => index + 1).filter((number) => !covered.has(number));
  return [
    `# Evidence: ${plan.question}`,
    asks.join("\n"),
    ...plan.sources.flatMap((source, index) => (results[index] ? [section(source, results[index])] : [])),
    uncovered.map((number) => `Uncovered: Q${number}`).join("\n"),
    ["Report:", ...reportLines(plan, results)].join("\n").replace(/^Report:$/, "Report: none"),
    file ? `Bundle: ${bundlePath(file)}` : "",
    plan.reads === null ? "" : endLine(plan, run, file),
  ]
    .filter(Boolean)
    .join("\n\n");
}

function saveRun(file, run) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(run));
}

export function record(plan, results, run, file) {
  if (plan.reads !== null) saveRun(file, run);
  const text = bundle(plan, results, run, file);
  mkdirSync(dirname(file), { recursive: true });
  appendFileSync(bundlePath(file), `${text}\n`);
  return text;
}

function loadRun(file) {
  try {
    const run = JSON.parse(readFileSync(file, "utf8"));
    return { plan: parsePlan(JSON.stringify(run.plan)), run };
  } catch (error) {
    throw new Error(`Cannot continue ${file}: ${error.message}`);
  }
}

async function readStdin() {
  let text = "";
  for await (const chunk of process.stdin) text += chunk;
  return text;
}

async function start() {
  const text = await readStdin();
  const plan = parsePlan(text);
  return { plan, run: newRun(JSON.parse(text)), file: join(RUNS_DIR, `${Date.now()}.json`) };
}

async function main() {
  let flags;
  try {
    flags = parseFlags(process.argv.slice(2), { continue: "string" });
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    console.error(error.message);
    process.exit(USAGE_EXIT);
  }
  let call;
  try {
    call = flags.continue === undefined ? await start() : { ...loadRun(flags.continue), file: flags.continue };
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
  const { plan, run, file } = call;
  const results = await advance(plan, run);
  const text = record(plan, results, run, file);
  killChildren();
  process.stdout.write(`${text}\n`, () => process.exit(0));
}

if (isMain(import.meta.url)) await main();

#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { environmentMs, isMain } from "#script-flags";
import { canonicalUrl } from "./pick.mjs";

const RETRIES = 2;
const SLOTS = 2;
const SLOT_POLL_MS = 20;
const inflight = new Map();
const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
const DROPPED = /<(script|style|nav|header|footer|noscript)\b[\s\S]*?<\/\1>|<!--[\s\S]*?-->/gi;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function htmlToText(html) {
  return html
    .replace(DROPPED, "")
    .replace(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi, (_, level, text) => `\n\n${"#".repeat(level)} ${text}\n\n`)
    .replace(/<\/?(p|div|section|article|ul|ol|table|blockquote|pre)\b[^>]*>/gi, "\n\n")
    .replace(/<(br|li|tr)\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&(?:#(\d+)|#x([\da-f]+)|(\w+));/gi, (whole, dec, hex, name) => {
      if (name) return ENTITIES[name.toLowerCase()] ?? whole;
      return String.fromCodePoint(dec ? Number(dec) : parseInt(hex, 16));
    })
    .replace(/[ \t\f\v ]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function bodyText(body, contentType) {
  const isHtml = contentType ? /html/i.test(contentType) : /^\s*(<!doctype html|<html)/i.test(body);
  return isHtml ? htmlToText(body) : body.trim();
}

function lockPaths(cacheDir, domain) {
  const name = domain.replace(/[^a-z0-9.-]/gi, "_");
  const locks = join(cacheDir, "locks");
  return { locks, slots: Array.from({ length: SLOTS }, (_, index) => join(locks, `${name}-${index}`)), last: join(locks, `${name}.last`) };
}

function takeSlot(slots, staleMs) {
  for (const slot of slots) {
    try {
      mkdirSync(slot);
      return slot;
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      if (Date.now() - statSync(slot, { throwIfNoEntry: false })?.mtimeMs > staleMs) rmSync(slot, { recursive: true, force: true });
    }
  }
  return null;
}

async function withDomainSlot(cacheDir, url, now, run) {
  const gap = environmentMs("EXO_SEARCH_DOMAIN_GAP_MS", 1000);
  const staleMs = 2 * environmentMs("EXO_SEARCH_FETCH_MS", 15000) + gap;
  const { locks, slots, last } = lockPaths(cacheDir, new URL(url).hostname);
  mkdirSync(locks, { recursive: true });
  let slot = takeSlot(slots, staleMs);
  while (!slot) {
    await sleep(SLOT_POLL_MS);
    slot = takeSlot(slots, staleMs);
  }
  try {
    const previous = existsSync(last) ? Number(readFileSync(last, "utf8")) : 0;
    await sleep(Math.max(0, previous + gap - now()));
    writeFileSync(last, String(now()));
    return await run();
  } finally {
    rmSync(slot, { recursive: true, force: true });
  }
}

function backoffMs(attempt, response) {
  const retryAfter = Number(response.headers.get("retry-after"));
  if (response.headers.get("retry-after") !== null && Number.isFinite(retryAfter)) return retryAfter * 1000;
  return environmentMs("EXO_SEARCH_BACKOFF_MS", 500) * 2 ** attempt * (1 + Math.random());
}

async function request(url, { cacheDir, fetchImpl, now, signal }) {
  for (let attempt = 0; ; attempt += 1) {
    signal.throwIfAborted();
    const response = await withDomainSlot(cacheDir, url, now, async () => {
      const reply = await fetchImpl(url, { signal: AbortSignal.any([signal, AbortSignal.timeout(environmentMs("EXO_SEARCH_FETCH_MS", 15000))]), headers: { "user-agent": "exo-search/1 (research reader)" } });
      return { status: reply.status, ok: reply.ok, headers: reply.headers, body: await reply.text() };
    });
    const retryable = response.status === 429 || response.status >= 500;
    if (!retryable || attempt === RETRIES) return response;
    await sleep(backoffMs(attempt, response));
  }
}

async function readText(url, context) {
  const response = await request(url, context);
  if (!response.ok) throw new Error(`HTTP ${response.status} from ${url}`);
  const text = bodyText(response.body, response.headers.get("content-type"));
  if (!text) throw new Error(`empty page from ${url}`);
  return text;
}

async function waybackText(url, context) {
  const lookup = await request(`https://archive.org/wayback/available?url=${encodeURIComponent(url)}`, context);
  const snapshot = lookup.ok ? JSON.parse(lookup.body).archived_snapshots?.closest?.url : undefined;
  if (!snapshot) throw new Error(`no Wayback snapshot for ${url}`);
  return readText(snapshot, context);
}

function cachedPage(url, file) {
  return { url, file, via: "cache", chars: readFileSync(file, "utf8").length };
}

async function downloadPage(url, file, context) {
  const routes = [
    ["direct", () => readText(url, context)],
    ["jina", () => readText(`https://r.jina.ai/${url}`, context)],
    ["wayback", () => waybackText(url, context)],
  ];
  const reasons = [];
  for (const [via, route] of routes) {
    try {
      const text = await route();
      const content = `Source: ${url}\n${text}`;
      mkdirSync(context.cacheDir, { recursive: true });
      const partial = `${file}.${process.pid}.tmp`;
      writeFileSync(partial, content);
      renameSync(partial, file);
      return { url, file, via, chars: content.length };
    } catch (error) {
      reasons.push(`${via}: ${error.message}`);
    }
  }
  throw new Error(`could not fetch ${url} (${reasons.join("; ")})`);
}

function withinBudget(url, signal, work) {
  const expired = new Promise((_, reject) => {
    signal.addEventListener("abort", () => reject(new Error(`time budget spent on ${url}`)), { once: true });
  });
  return Promise.race([work, expired]);
}

export async function fetchPage(url, { cacheDir, fetchImpl = fetch, now = Date.now }) {
  const file = join(cacheDir, `${createHash("sha1").update(canonicalUrl(url)).digest("hex")}.md`);
  if (inflight.has(file)) await inflight.get(file);
  if (existsSync(file)) return cachedPage(url, file);
  const signal = AbortSignal.timeout(environmentMs("EXO_SEARCH_URL_BUDGET_MS", 45000));
  const download = withinBudget(url, signal, downloadPage(url, file, { cacheDir, fetchImpl, now, signal })).finally(() => inflight.delete(file));
  inflight.set(file, download);
  return download;
}

async function main(args) {
  const runAt = args.indexOf("--run");
  const cacheDir = args[runAt + 1];
  const urls = args.filter((_, index) => index !== runAt && index !== runAt + 1);
  if (runAt === -1 || !cacheDir || urls.length === 0) {
    console.error("usage: fetch.mjs --run <dir> <url>...");
    process.exit(2);
  }
  await Promise.all(
    urls.map(async (url) => {
      try {
        const { file, via } = await fetchPage(url, { cacheDir });
        console.log(`Fetched: ${url} -> ${file} (${via})`);
      } catch (error) {
        console.log(`Failed: ${url} ${error.message}; use WebFetch`);
      }
    }),
  );
}

if (isMain(import.meta.url)) await main(process.argv.slice(2));

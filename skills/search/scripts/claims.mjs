#!/usr/bin/env node
import { createHash } from "node:crypto";
import { linkSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isMain } from "#script-flags";

const FINAL = new Set(["ok", "summary"]);
const CORRUPT = { leaseUntil: 0, status: "corrupt" };

export const SUB = /^Q\d+b?$/;

export function canonicalUrl(url) {
  const { host, pathname, searchParams } = new URL(url);
  const bare = host.replace(/^www\./, "").replace(/^old\.reddit\.com$/, "reddit.com");
  const kept = [...searchParams].filter(([name]) => !name.startsWith("utm_"));
  const search = kept.length ? `?${new URLSearchParams(kept)}` : "";
  return `${bare}${pathname.replace(/\/+$/, "")}${search}`;
}

const sha1Of = (url) => createHash("sha1").update(url).digest("hex");

const recordPath = (runDir, sha1, generation) => join(runDir, "claims", `${sha1}.${generation}.json`);

function latest(runDir, sha1) {
  let generation = 0;
  let record = null;
  for (;;) {
    try {
      record = JSON.parse(readFileSync(recordPath(runDir, sha1, generation), "utf8"));
    } catch (error) {
      if (error.code === "ENOENT") return { generation, record };
      if (!(error instanceof SyntaxError)) throw error;
      record = CORRUPT;
    }
    generation += 1;
  }
}

function createRecord(runDir, sha1, generation, record) {
  const file = recordPath(runDir, sha1, generation);
  const temporary = `${file}.${process.pid}.tmp`;
  writeFileSync(temporary, JSON.stringify(record));
  try {
    linkSync(temporary, file);
    return true;
  } catch (error) {
    if (error.code === "EEXIST") return false;
    throw error;
  } finally {
    unlinkSync(temporary);
  }
}

function isExpired(record, now) {
  return record.leaseUntil !== null && record.leaseUntil <= now && !FINAL.has(record.status);
}

export function claimSource(runDir, url, sub, { now = Date.now(), leaseMs } = {}) {
  mkdirSync(join(runDir, "claims"), { recursive: true });
  const canonical = canonicalUrl(url);
  const sha1 = sha1Of(canonical);
  const mine = { url: canonical, sha1, sub, pid: process.pid, leaseUntil: leaseMs === undefined ? null : now + leaseMs };
  for (;;) {
    const { generation, record } = latest(runDir, sha1);
    if (record?.sub === sub) return { claimed: true };
    if (record && !isExpired(record, now)) return { taken: record.sub };
    if (createRecord(runDir, sha1, generation, mine)) return { claimed: true };
  }
}

export const claimOwner = (runDir, url) => latest(runDir, sha1Of(canonicalUrl(url))).record?.sub;

export function markClaim(runDir, url, sub, fields) {
  const canonical = canonicalUrl(url);
  const sha1 = sha1Of(canonical);
  const { generation, record } = latest(runDir, sha1);
  if (!record) throw new Error(`no claim to mark for ${canonical} in ${runDir}`);
  if (record.sub !== sub) return false;
  const file = recordPath(runDir, sha1, generation - 1);
  const temporary = `${file}.${process.pid}.tmp`;
  writeFileSync(temporary, JSON.stringify({ ...record, ...fields }));
  renameSync(temporary, file);
  return true;
}

export function markQuietly(runDir, url, sub, fieldsOf) {
  try {
    return markClaim(runDir, url, sub, fieldsOf());
  } catch (error) {
    console.error(`Claim mark failed: ${url} ${error.message}`);
    return undefined;
  }
}

function main(args) {
  const [command, runDir, sub, url] = args;
  if (command !== "summary" || args.length !== 4 || !SUB.test(sub)) {
    console.error("usage: claims.mjs summary <run dir> <sub> <url>");
    process.exit(2);
  }
  const result = claimSource(runDir, url, sub);
  if (result.taken) console.log(`Taken: ${url} (${result.taken})`);
  else markClaim(runDir, url, sub, { status: "summary" });
}

if (isMain(import.meta.url)) main(process.argv.slice(2));

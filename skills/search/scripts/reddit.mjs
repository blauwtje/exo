#!/usr/bin/env node
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { createServer } from "node:net";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { join } from "node:path";
import { environmentMs, isMain } from "#script-flags";
import { readBest, searchAll } from "./pick.mjs";

const home = process.env.SEARCH_REDDIT_HOME ?? join(homedir(), ".search-reddit");
const profile = join(home, "profile");
const port = Number(process.env.SEARCH_REDDIT_PORT ?? 9333);
const chromePaths = {
  darwin: "/Applications/Google Chrome.app",
  win32: join(process.env.PROGRAMFILES ?? "C:\\Program Files", "Google", "Chrome", "Application", "chrome.exe"),
  linux: "/usr/bin/google-chrome",
};
const chrome = process.env.CHROME_PATH ?? chromePaths[process.platform];

const playwrightVersion = "1.65.1";

function loadPlaywright() {
  const require = createRequire(join(home, "package.json"));
  try {
    return require("playwright-core");
  } catch (error) {
    if (error.code !== "MODULE_NOT_FOUND") throw error;
    console.error("Installing playwright-core once...");
    execFileSync("npm", ["install", "--prefix", home, "--no-audit", "--no-fund", "--silent", "--ignore-scripts", `playwright-core@${playwrightVersion}`], { stdio: "inherit", shell: process.platform === "win32" });
    return require("playwright-core");
  }
}

function launch(visible) {
  const flags = [`--user-data-dir=${profile}`, `--remote-debugging-port=${port}`, "--no-first-run", "--no-default-browser-check", "--use-mock-keychain", "--password-store=basic", "--no-startup-window"];
  const [file, launchArgs] = process.platform === "darwin" ? ["open", [...(visible ? [] : ["-g"]), "-n", "-a", chrome, "--args", ...flags]] : [chrome, flags];
  const child = spawn(file, launchArgs, { detached: true, stdio: "ignore" });
  child.once("error", (error) => {
    child.spawnError = error;
  });
  child.unref();
  return child;
}

function stopChrome(child) {
  if (process.platform === "darwin") spawnSync("pkill", ["-f", "--", `--user-data-dir=${profile.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}( |$)`]);
  else child.kill();
}

async function connect(visible) {
  const { chromium } = loadPlaywright();
  const child = launch(visible);
  const deadline = Date.now() + environmentMs("EXO_SEARCH_CHROME_START_MS", 10000);
  let lastError;
  while (!child.spawnError && Date.now() < deadline) {
    try {
      return await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: Math.max(1, deadline - Date.now()) });
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  stopChrome(child);
  throw new Error(`Chrome did not start from ${chrome}: set CHROME_PATH. (${(child.spawnError ?? lastError)?.message})`);
}

async function backgroundPage(browser) {
  const session = await browser.newBrowserCDPSession();
  await session.send("Target.createTarget", { url: "about:blank", background: true, newWindow: true, left: -32000, top: -32000, width: 800, height: 600 });
  const [context] = browser.contexts();
  return context.pages()[0] ?? (await context.waitForEvent("page"));
}

async function quit(browser) {
  const session = await browser.newBrowserCDPSession();
  await session.send("Browser.close").catch(() => {});
}

const chromeLockPort = port + 1;

const login = () => withLock(chromeLockPort, loginLocked);

async function loginLocked() {
  const browser = await connect(true);
  const page = await browser.contexts()[0].newPage();
  await page.goto("https://www.reddit.com/login");
  console.log("Log in to Reddit in the Chrome window, then close that tab.");
  await page.waitForEvent("close", { timeout: 0 });
  await quit(browser);
}

const listen = (lockPort) => new Promise((resolve, reject) => {
  const server = createServer((socket) => socket.destroy());
  server.once("error", reject);
  server.listen(lockPort, "127.0.0.1", () => resolve(server));
});

async function takeLock(lockPort) {
  const deadline = Date.now() + environmentMs("EXO_SEARCH_LOCK_MS", 60000);
  for (let attempt = 0; ; attempt++) {
    try {
      return await listen(lockPort);
    } catch (error) {
      if (error.code !== "EADDRINUSE") throw error;
      const waiting = `Waiting for the Chrome lock on 127.0.0.1:${lockPort}: another run holds it, or another app uses that port.`;
      if (Date.now() >= deadline) throw new Error(waiting);
      if (attempt === 0) console.error(waiting);
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
}

export async function withLock(lockPort, task) {
  const server = await takeLock(lockPort);
  try {
    return await task();
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

const visit = (url, read) => withLock(chromeLockPort, () => visitLocked(url, read));

async function visitLocked(url, read) {
  const browser = await connect(false);
  try {
    const page = await backgroundPage(browser);
    const response = await page.goto(url);
    if (new URL(page.url()).pathname.startsWith("/login")) throw new Error(`Not logged in: run \`reddit.mjs login\` first. (${page.url()})`);
    if (!response.ok()) throw new Error(`Reddit answered ${response.status()} for ${url}`);
    return await read(page, response);
  } finally {
    await quit(browser);
  }
}

const moreBatch = 100;

function replyLists(children, lists) {
  for (const { kind, data } of children) {
    if (kind === "more") continue;
    data.replies ||= { kind: "Listing", data: { children: [] } };
    lists.set(data.name, data.replies.data.children);
    replyLists(data.replies.data.children, lists);
  }
  return lists;
}

function takeStubs(children) {
  const ids = [];
  for (let index = children.length - 1; index >= 0; index--) {
    const { kind, data } = children[index];
    if (kind === "more" && data.children?.length) ids.push(...children.splice(index, 1)[0].data.children);
    else if (kind !== "more") ids.push(...takeStubs(data.replies.data.children));
  }
  return ids;
}

async function loadMore(page, postName, comments) {
  const lists = replyLists(comments.data.children, new Map([[postName, comments.data.children]]));
  const queue = takeStubs(comments.data.children);
  while (queue.length) {
    const body = new URLSearchParams({ api_type: "json", link_id: postName, children: queue.splice(0, moreBatch).join(","), raw_json: "1" }).toString();
    const answer = await page.evaluate(async (form) => {
      const reply = await fetch("/api/morechildren", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: form });
      const text = await reply.text();
      if (!reply.ok) throw new Error(reply.status + " " + text.slice(0, 300));
      return JSON.parse(text);
    }, body);
    const things = answer.json.data.things;
    for (const { kind, data } of things) {
      if (kind === "more") continue;
      data.replies ||= { kind: "Listing", data: { children: [] } };
      lists.set(data.name, data.replies.data.children);
    }
    for (const thing of things) {
      if (thing.kind === "more") queue.push(...(thing.data.children ?? []));
      else lists.get(thing.data.parent_id)?.push(thing);
    }
  }
  return comments;
}

function threadUrl(link) {
  const url = new URL(link, "https://old.reddit.com");
  url.hostname = "old.reddit.com";
  url.pathname = `${url.pathname.replace(/\/$/, "")}.json`;
  url.search = new URLSearchParams({ limit: "500", raw_json: "1" });
  return url.href;
}

function postHeader(post) {
  const parts = [
    `${post.title}\nr/${post.subreddit} | u/${post.author} | ${post.score} points | ${post.num_comments} comments | ${new Date(post.created_utc * 1000).toISOString().slice(0, 10)}\nhttps://www.reddit.com${post.permalink}`,
  ];
  if (post.selftext) parts.push(post.selftext);
  if (post.url && !post.is_self) parts.push(`Link: ${post.url}`);
  return parts.join("\n\n");
}

function flattenComments(children, parent, comments) {
  for (const { kind, data } of children) {
    if (kind === "more") continue;
    const live = data.body !== "[deleted]" && data.body !== "[removed]";
    if (live) comments.push({ id: data.id, parent, label: `u/${data.author}`, score: data.score, body: data.body, link: `https://www.reddit.com${data.permalink}` });
    if (data.replies) flattenComments(data.replies.data.children, live ? data.id : parent, comments);
  }
  return comments;
}

export function threadDoc(listing, comments) {
  const header = postHeader(listing.data.children[0].data);
  return { header, passages: flattenComments(comments.data.children, null, []) };
}

export function timeBucket(days) {
  if (days <= 1) return "day";
  if (days <= 7) return "week";
  if (days <= 31) return "month";
  if (days <= 366) return "year";
  return "all";
}

export function paced(gapMs) {
  let tail = Promise.resolve();
  return (task) => {
    const run = tail.then(task);
    tail = run.catch(() => {}).then(() => new Promise((resolve) => setTimeout(resolve, gapMs)));
    return run;
  };
}

const queue = paced(environmentMs("EXO_SEARCH_REDDIT_GAP_MS", 2000));
const load = (url, read) => queue(() => visit(url, read));

function searchUrl(term, subreddits, days) {
  const url = new URL(subreddits.length ? `https://old.reddit.com/r/${subreddits.join("+")}/search` : "https://old.reddit.com/search");
  url.search = new URLSearchParams({ q: term, sort: "top", t: timeBucket(days), ...(subreddits.length && { restrict_sr: "on" }) });
  return url.href;
}

const scrapeResults = (page) =>
  page.$$eval(".search-result-link", (results) =>
    results.flatMap((result) => {
      const anchor = result.querySelector("a.search-title");
      if (!anchor) return [];
      const text = (selector) => result.querySelector(selector)?.textContent.trim() ?? "";
      return {
        url: anchor.href,
        title: anchor.textContent.trim(),
        facts: [text(".search-score"), text(".search-comments"), text(".search-subreddit-link"), result.querySelector("time")?.dateTime.slice(0, 10) ?? ""].join(" | "),
      };
    }),
  );

const MAX_SEARCHES = 40;

function plannedSearches({ subQuestions, subreddits }) {
  const siteWide = subQuestions.map(({ terms }) => [terms[0], []]);
  const termCount = Math.max(...subQuestions.map(({ terms }) => terms.length));
  const inSubreddit = Array.from({ length: termCount }, (_, position) =>
    subQuestions.flatMap(({ terms }) => (terms[position] ? subreddits.map((subreddit) => [terms[position], [subreddit]]) : [])),
  ).flat();
  return [...siteWide, ...inSubreddit];
}

export async function find(plan, loadPage = load) {
  const planned = plannedSearches(plan).map(([term, subreddits]) => ({
    term,
    subreddits,
    label: `"${term}" ${subreddits.length ? `in r/${subreddits.join("+")}` : "on all of Reddit"}`,
  }));
  const kept = planned.slice(0, MAX_SEARCHES).map(({ term, subreddits, label }) => ({
    label,
    cards: loadPage(searchUrl(term, subreddits, plan.days), scrapeResults),
  }));
  const { lists, failed } = await searchAll(kept);
  const dropped = planned.slice(MAX_SEARCHES);
  return { lists, failed: dropped.length ? [...failed, `dropped ${dropped.length} of ${planned.length} searches: limit is ${MAX_SEARCHES}: ${dropped.map(({ label }) => label).join(", ")}`] : failed };
}

export async function open(card, loadPage = load) {
  const [listing, comments] = await loadPage(threadUrl(card.url), async (page, response) => {
    const [listing, comments] = JSON.parse(await response.text());
    return [listing, await loadMore(page, listing.data.children[0].data.name, comments)];
  });
  return threadDoc(listing, comments);
}

export const collect = (plan, state = null, limit = Infinity) => readBest(plan, { find, open }, undefined, state, limit);

if (isMain(import.meta.url)) {
  if (process.argv[2] !== "login") {
    console.error("Usage: reddit.mjs login");
    process.exit(1);
  }
  try {
    await login();
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

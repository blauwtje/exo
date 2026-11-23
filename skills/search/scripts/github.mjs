import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readBest, searchAll } from "./pick.mjs";

const run = promisify(execFile);
const MAX_GH_CALLS = 20;
const SEARCH_LIMIT = 20;
const MAX_BUFFER = 32 * 1024 * 1024;
const REPO_FIELDS = "fullName,url,description,stargazersCount,pushedAt";
const ISSUE_FIELDS = "title,url,body,commentsCount,createdAt,repository";

async function gh(args) {
  try {
    const { stdout } = await run("gh", args, { maxBuffer: MAX_BUFFER });
    return stdout;
  } catch (error) {
    throw new Error(`gh ${args.slice(0, 2).join(" ")} failed: ${(error.stderr || error.message).trim()}`);
  }
}

const day = (timestamp) => timestamp.slice(0, 10);

export const repoCards = (rows) =>
  rows.map((row) => ({
    url: row.url,
    title: row.fullName,
    facts: [`${row.stargazersCount} stars`, `pushed ${day(row.pushedAt)}`, row.description].filter(Boolean).join(" | "),
  }));

export const issueCards = (rows) =>
  rows.map((row) => ({
    url: row.url,
    title: `${row.repository.nameWithOwner}: ${row.title}`,
    facts: `${row.commentsCount} comments | ${day(row.createdAt)}`,
  }));

function searchCalls(plan) {
  const firstTerms = plan.subQuestions.map(({ terms }) => terms[0]);
  const since = `pushed:>=${plan.since}`;
  const repos = (term, topic) => ({
    label: `repos "${term}"${topic ? ` topic ${topic}` : ""}`,
    cards: repoCards,
    args: ["search", "repos", `${term} ${since}`, ...(topic ? ["--topic", topic] : []), "--limit", String(SEARCH_LIMIT), "--json", REPO_FIELDS],
  });
  return [
    ...plan.subQuestions.flatMap(({ terms }) => terms).map((term) => repos(term)),
    ...firstTerms.map((term) => ({ label: `issues "${term}"`, cards: issueCards, args: ["search", "issues", `${term} created:>=${plan.since}`, "--limit", String(SEARCH_LIMIT), "--json", ISSUE_FIELDS] })),
    ...plan.topics.flatMap((topic) => firstTerms.map((term) => repos(term, topic))),
  ];
}

export async function find(plan) {
  const planned = searchCalls(plan);
  const kept = planned.slice(0, MAX_GH_CALLS);
  const { lists, failed } = await searchAll(kept.map(({ label, cards, args }) => ({ label, cards: gh(args).then((out) => cards(JSON.parse(out))) })));
  const dropped = planned.slice(MAX_GH_CALLS);
  return { lists, failed: dropped.length ? [...failed, `dropped ${dropped.length} of ${planned.length} searches: limit is ${MAX_GH_CALLS}: ${dropped.map(({ label }) => label).join(", ")}`] : failed };
}

const slug = (heading) => heading.toLowerCase().replace(/[^\w\s-]/g, "").trim().replace(/\s/g, "-");

export function sections(markdown, url) {
  const parts = [{ label: "Overview", link: url, lines: [] }];
  let fenced = false;
  for (const line of markdown.split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
    const heading = fenced ? null : line.match(/^#{1,6}\s+(.+?)\s*#*\s*$/);
    if (heading) parts.push({ label: heading[1], link: `${url}#${slug(heading[1])}`, lines: [] });
    else parts.at(-1).lines.push(line);
  }
  return parts
    .map(({ label, link, lines }) => ({ label, link, body: lines.join("\n").trim() }))
    .filter(({ body }) => body)
    .map((part, index) => ({ id: `s${index + 1}`, parent: null, score: null, ...part }));
}

async function openRepo(card) {
  const [owner, repo] = new URL(card.url).pathname.split("/").filter(Boolean);
  const readme = await gh(["api", "-H", "Accept: application/vnd.github.raw", `repos/${owner}/${repo}/readme`]);
  return { header: `${card.title} README\n${card.url}`, passages: sections(readme, card.url) };
}

async function openIssue(card) {
  const [owner, repo, , number] = new URL(card.url).pathname.split("/").filter(Boolean);
  const path = `repos/${owner}/${repo}/issues/${number}`;
  const [issue, comments] = await Promise.all([gh(["api", path]), gh(["api", "--paginate", "--slurp", `${path}/comments`])]);
  const { title, body, user, created_at: created } = JSON.parse(issue);
  return {
    header: `${title}\nu/${user.login} | ${day(created)}\n${card.url}\n\n${body ?? ""}`.trim(),
    passages: JSON.parse(comments).flat().map((comment) => ({
      id: String(comment.id),
      parent: null,
      label: `u/${comment.user.login}`,
      score: null,
      body: comment.body,
      link: comment.html_url,
    })),
  };
}

export const open = (card) => (/\/issues\/\d+$/.test(new URL(card.url).pathname) ? openIssue(card) : openRepo(card));

export const collect = (plan, state = null, limit = Infinity) => readBest(plan, { find, open }, undefined, state, limit);

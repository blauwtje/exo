import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { attributionProblem, branchNameProblem, subjectProblem } from '#commit-text';

export class StepError extends Error {
  constructor(step, reason, { subject, code = 1 } = {}) {
    super(reason);
    this.step = step;
    this.subject = subject;
    this.code = code;
  }
}

export function firstLine(text) {
  return (text.split('\n').find((line) => line.trim() !== '') ?? 'no output').trim();
}

export function runGit(args) {
  try {
    return { ok: true, stdout: execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) };
  } catch (error) {
    return { ok: false, error: firstLine(`${error.stderr ?? ''}`) };
  }
}

export function runGh(args) {
  try {
    return { ok: true, stdout: execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) };
  } catch (error) {
    return { ok: false, error: firstLine(`${error.stderr ?? ''}`) };
  }
}

export function existingPullRequest(branch) {
  const result = runGh(['pr', 'view', branch, '--json', 'number,url,state']);
  if (!result.ok) return null;
  const pullRequest = JSON.parse(result.stdout);
  return pullRequest.state === 'OPEN' ? pullRequest : null;
}

function issueFields(issue) {
  const result = runGh(['issue', 'view', String(issue), '--json', 'labels,milestone,projectItems']);
  if (!result.ok) throw new StepError('create', `gh=${result.error}`);
  const data = JSON.parse(result.stdout);
  return {
    labels: (data.labels ?? []).map((label) => label.name),
    milestone: data.milestone?.title,
    projects: (data.projectItems ?? []).map((item) => item.title).filter(Boolean)
  };
}

export function createPullRequest(branch, base, flags) {
  const fields = flags.issue !== undefined ? issueFields(flags.issue) : { labels: [], milestone: undefined, projects: [] };
  const args = ['pr', 'create', '--base', base, '--head', branch, '--title', flags.title, '--body-file', flags.body];
  for (const label of fields.labels) args.push('--label', label);
  if (fields.milestone) args.push('--milestone', fields.milestone);
  for (const project of fields.projects) args.push('--project', project);
  const result = runGh(args);
  if (!result.ok) throw new StepError('create', `gh=${result.error}`);
  const url = firstLine(result.stdout);
  const number = Number(url.match(/\/pull\/(\d+)/)?.[1]);
  return { number, url };
}

export function refuseBadText(flags, branch) {
  if (flags.route === 'push') return;
  let body;
  try {
    body = fs.readFileSync(flags.body, 'utf8');
  } catch {
    throw new StepError('create', `body-unreadable ${flags.body}`);
  }
  const problem = subjectProblem(flags.title) ?? attributionProblem(`${flags.title}\n${body}`) ?? branchNameProblem(branch);
  if (problem !== null) throw new StepError('create', `text-refused: ${problem}`);
}

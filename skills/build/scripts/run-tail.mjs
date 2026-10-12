import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { SCRATCH_FOLDER } from '#scratch-path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = path.resolve(HERE, '..', '..', '..');
const SCRIPT = {
  verify: path.join(PLUGIN_ROOT, 'skills', 'verify', 'scripts', 'verify.mjs'),
  mergeReviews: path.join(PLUGIN_ROOT, 'skills', 'verify', 'scripts', 'merge-reviews.mjs'),
  runProbes: path.join(PLUGIN_ROOT, 'skills', 'verify', 'scripts', 'run-probes.mjs'),
  landTask: path.join(HERE, 'land-task.mjs')
};
const REVIEW_AGENT = path.join(PLUGIN_ROOT, 'agents', 'review-branch.md');
const FIXER_PROMPT = path.join(PLUGIN_ROOT, 'skills', 'build', 'review-fixer-prompt.md');
const REVIEW_RULES = path.join(PLUGIN_ROOT, 'skills', 'verify', 'references', 'review-rules.md');
const CODE_STANDARD = path.join(PLUGIN_ROOT, 'skills', 'route-skills', 'references', 'code-standard.md');

const node = (script, args, root) => spawnSync(process.execPath, [script, ...args], {
  cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, env: { ...process.env, EXO_RUN_TASK: undefined }
});
const out = (answer) => `${answer.stdout ?? ''}${answer.stderr ?? ''}`;

const agentBody = () => fs.readFileSync(REVIEW_AGENT, 'utf8').replace(/^---\n[\s\S]*?\n---\n/, '').replaceAll('${CLAUDE_PLUGIN_ROOT}', PLUGIN_ROOT).trim();

const agentModel = () => fs.readFileSync(REVIEW_AGENT, 'utf8').match(/^---\n[\s\S]*?^model:\s*(\S+)\s*$[\s\S]*?\n---\n/m)?.[1] ?? null;

function fixerPrompt({ planPath, root, base, findings }) {
  const block = fs.readFileSync(FIXER_PROMPT, 'utf8').match(/```text\n([\s\S]*?)\n```/)[1];
  return block.replace(/<plan path>/g, planPath).replace(/<root>/g, root).replace(/<base>/g, base).replace(/<findings path>/g, findings).replace(/<plan>/g, planPath);
}

function reviewPrompt({ planPath, root, base, branch, scope, findings, questions = [] }) {
  return [
    agentBody(),
    '',
    '## Inputs',
    `- Code standard: ${CODE_STANDARD}`,
    `- Review rules: ${REVIEW_RULES}`,
    `- Plan: ${planPath}`,
    `- Branch: ${branch}`,
    `- Checkout: ${root}`,
    `- Base: ${base}`,
    `- Implementer report directory: ${path.join(root, SCRATCH_FOLDER)}/`,
    `- Scope: ${scope}`,
    `- Findings path: ${findings}`,
    ...(questions.length > 0 ? ['- Questions:', ...questions.map((question) => `  - ${question}`)] : [])
  ].join('\n');
}

const verdictOf = (text) => text.match(/verdict=(CLEAN|FINDINGS|BLOCKED)\b/)?.[1] ?? null;
const countOf = (text, name) => Number(text.match(new RegExp(`\\b${name}=(\\d+)`))?.[1] ?? 0);

export function parseReviewLines(text) {
  const reviews = [];
  const overlaps = [];
  const reviewed = [];
  for (const line of text.split('\n')) {
    const review = line.match(/^REVIEW Task (\d+) ([^:]*): (review-branch)(?: model=(\S+))?(?: effort=(\S+))?\s*$/);
    if (review !== null) reviews.push({ number: Number(review[1]), shas: review[2], model: review[4] ?? null });
    const overlap = line.match(/^OVERLAP (?!none)(.+?) \(Tasks [^)]*\)$/);
    if (overlap !== null) overlaps.push(overlap[1]);
    const record = line.match(/^REVIEWED Task \d+ (.+)$/);
    if (record !== null) reviewed.push(record[1]);
  }
  return { reviews, overlaps, reviewed };
}

const stopOf = (line, why, next) => ({ line, why, next });

export async function runTail({ planPath, plan, root, base, branch, runSession, say = () => {} }) {
  const gateArgs = ['--plan', planPath, '--root', root, ...(base === null ? [] : ['--base', base])];
  const exo = path.join(root, SCRATCH_FOLDER);
  const baseText = base ?? 'HEAD';
  const { reviews, overlaps, reviewed } = parseReviewLines(out(node(SCRIPT.verify, [...gateArgs, '--reviews-only'], root)));
  const reports = [...reviewed];
  const reviewModel = agentModel();
  const dispatches = [
    ...reviews.map((review) => {
      const task = plan.tasks.find((entry) => entry.number === review.number);
      const findings = path.join(exo, `review-${review.shas.split(',')[0].slice(0, 7)}.md`);
      const questions = [
        `Does the task's commit do what its heading "${task.title}" says and nothing outside its Files:?`,
        'Does it meet the Data: line of its plan section?',
        ...(task.risk === null ? [] : [`Does it hold its Risk: "${task.risk}"?`]),
        'Does it follow the code standard, and does each test observe changed behavior?'
      ];
      return { task: review.number, model: review.model ?? reviewModel, findings, scope: `task ${review.shas.replaceAll(',', ' ')}`, questions };
    }),
    ...(overlaps.length === 0 ? [] : [{ task: null, model: reviewModel, findings: path.join(exo, 'review-overlap.md'), scope: `overlap\n${overlaps.map((target) => `OVERLAP ${target}`).join('\n')}`, questions: [] }])
  ];
  for (const dispatch of dispatches) {
    say(`review start: ${dispatch.task === null ? 'overlap' : `task ${dispatch.task}`}`);
    fs.rmSync(dispatch.findings, { force: true });
    const session = await runSession({ kind: 'review', task: dispatch.task, model: dispatch.model, prompt: reviewPrompt({ planPath, root, base: baseText, branch, ...dispatch }) });
    if (session.stop !== undefined) return { stop: session.stop };
    reports.push(dispatch.findings);
    say(`review done: ${verdictOf(session.resultText) ?? 'no verdict line'}`);
  }

  if (reports.length > 0) {
    const merged = out(node(SCRIPT.mergeReviews, ['--root', root, ...reports.flatMap((report) => ['--report', report])], root));
    const verdict = verdictOf(merged);
    const findings = path.join(exo, 'branch-review.md');
    if (verdict === 'BLOCKED') return { stop: stopOf('branch review BLOCKED', 'The branch review could not finish (BLOCKED)', `read ${findings}, fix the cause, then run exo run again`) };
    if (verdict === 'FINDINGS' && countOf(merged, 'fix') >= 1) {
      say('fix start');
      const session = await runSession({ kind: 'fix', task: null, model: null, prompt: fixerPrompt({ planPath, root, base: baseText, findings }) });
      if (session.stop !== undefined) return { stop: session.stop };
      const gate = node(SCRIPT.verify, gateArgs, root);
      const failing = out(gate).split('\n').find((line) => /^(FAIL|STRAY)\b/.test(line));
      if (failing !== undefined) return { stop: stopOf(`fix broke the gate: ${failing}`, 'The review fix failed the gate; its edits stay uncommitted', `read ${findings}, repair on the branch, then run exo run again`) };
      const probes = node(SCRIPT.runProbes, ['--report', findings, '--root', root], root);
      const failedProbe = out(probes).split('\n').find((line) => /^FAIL probe\b/.test(line));
      if (failedProbe !== undefined) return { stop: stopOf(`fix probe failed: ${failedProbe}`, 'A fixed finding still fails its probe; the fix stays uncommitted', `read ${findings}, repair on the branch, then run exo run again`) };
      const fixReview = path.join(exo, 'fix-review.md');
      fs.rmSync(fixReview, { force: true });
      say('fix review start');
      const second = await runSession({ kind: 'review', task: null, model: reviewModel, prompt: reviewPrompt({ planPath, root, base: baseText, branch, scope: 'fix diff', findings: fixReview }) });
      if (second.stop !== undefined) return { stop: second.stop };
      const text = fs.existsSync(fixReview) ? fs.readFileSync(fixReview, 'utf8') : '';
      const secondVerdict = text.match(/\b(CLEAN|FINDINGS|BLOCKED)\b/)?.[1] ?? 'BLOCKED';
      const fixCount = (text.match(/;\s*fix\s*$/gm) ?? []).length;
      if (secondVerdict === 'BLOCKED' || (secondVerdict === 'FINDINGS' && fixCount > 0)) {
        return { stop: stopOf(`fix review ${secondVerdict}`, `The review of the fix returned ${secondVerdict}; the fix stays uncommitted`, `read ${fixReview}, then run exo run again`) };
      }
      const status = spawnSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' });
      if (status.status === 0 && status.stdout.trim() === '') {
        say('fix landed: nothing to commit');
      } else {
        const scope = plan.tasks[0]?.title.match(/^\w+\(([^)]+)\)/)?.[1];
        const landed = node(SCRIPT.landTask, ['--fix', `fix${scope === undefined ? '' : `(${scope})`}: address the branch review`, '--plan', planPath, '--root', root], root);
        if (landed.status !== 0) return { stop: stopOf('fix landing failed', `Landing the review fix failed: ${out(landed).trim().split('\n').at(-1)}`, 'repair on the branch, then run exo run again') };
        say('fix landed');
      }
    }
  }
  const gate = node(SCRIPT.verify, gateArgs, root);
  return { gate };
}

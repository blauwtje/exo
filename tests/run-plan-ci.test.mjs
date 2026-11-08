import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { tempDir } from './harness.mjs';
import { parseYaml } from './yaml-subset.mjs';

const SCRIPTS = fileURLToPath(new URL('../skills/build/scripts/', import.meta.url));
const RENDER = path.join(SCRIPTS, 'ci-render.mjs');
const WORKFLOW = path.join('.github', 'workflows', 'exo-run.yml');

const render = (root, ...flags) => spawnSync(process.execPath, [RENDER, '--root', root, ...flags], { encoding: 'utf8' });

function renderedWorkflow() {
  const root = tempDir('exo-ci-');
  assert.equal(render(root).status, 0);
  const text = fs.readFileSync(path.join(root, WORKFLOW), 'utf8');
  return { text, workflow: parseYaml(text) };
}

test('the agent job holds only a read token and only the push job writes', () => {
  const { workflow } = renderedWorkflow();
  assert.deepEqual(workflow.permissions, {});
  assert.deepEqual(workflow.jobs.agent.permissions, { contents: 'read' });
  assert.deepEqual(workflow.jobs.push.permissions, { contents: 'write', 'pull-requests': 'write' });
  assert.equal(workflow.jobs.push.needs, 'agent');
  assert.match(workflow.jobs.push.if, /needs\.agent\.result == 'success'/);
});

test('only trusted authors on an issue start a run, never a pull request', () => {
  const { workflow } = renderedWorkflow();
  const gate = workflow.jobs.agent.if;
  assert.match(gate, /github\.event\.issue\.pull_request == null/);
  assert.match(gate, /comment\.author_association\)/);
  assert.match(gate, /issue\.author_association\)/);
  assert.equal(gate.match(/OWNER","MEMBER","COLLABORATOR/g).length, 2);
  assert.match(gate, /label\.name == 'exo'/);
  assert.deepEqual(workflow.on.issues.types, ['labeled']);
});

test('the comment text reaches the shell only through env and the path check', () => {
  const { text, workflow } = renderedWorkflow();
  const steps = workflow.jobs.agent.steps;
  const reader = steps.find((step) => step.id === 'plan');
  assert.equal(reader.env.EXO_TEXT, '${{ github.event.comment.body || github.event.issue.body }}');
  assert.match(reader.run, /ci-plan-path\.mjs/);
  const runner = steps.find((step) => step.id === 'run');
  assert.equal(runner.env.EXO_PLAN, '${{ steps.plan.outputs.plan }}');
  for (const step of Object.values(workflow.jobs).flatMap((job) => job.steps)) {
    if (step.run !== undefined) assert.doesNotMatch(step.run, /\$\{\{/, step.run);
  }
  assert.doesNotMatch(text, /__[A-Z_]+__/);
  assert.equal(workflow.jobs.agent.steps.find((step) => step.uses?.startsWith('actions/checkout')).with.ref, '${{ github.event.repository.default_branch }}');
});

test('the plan path pattern refuses anything that could inject a shell', async () => {
  const { planPathFrom } = await import(path.join(SCRIPTS, 'ci-plan-path.mjs'));
  assert.equal(planPathFrom('/exo run docs/plans/x.md'), 'docs/plans/x.md');
  assert.equal(planPathFrom('hello\n/exo run docs/specs/a-b_1.md  \nthanks'), 'docs/specs/a-b_1.md');
  for (const hostile of ['/exo run docs/plans/x.md; rm -rf /', '/exo run docs/plans/$(id).md', '/exo run docs/plans/`id`.md', '/exo run docs/plans/../../x.md', '/exo run docs/plans/x.md && id', '/exo run /etc/passwd', '/exo run docs/plans/a b.md', '/exo run docs/plans/x.md\n$(id)', 'run docs/plans/x.md', '', undefined]) {
    const found = planPathFrom(hostile);
    assert.ok(found === null || found === 'docs/plans/x.md' && hostile.includes('\n'), JSON.stringify(hostile));
    if (!String(hostile).includes('\n')) assert.equal(found, null, JSON.stringify(hostile));
  }
});

test('a dry run on a fixture repo writes the workflow once and keeps a user edit', () => {
  const root = tempDir('exo-ci-repo-');
  const first = render(root);
  assert.equal(first.status, 0, first.stderr);
  const target = path.join(root, WORKFLOW);
  assert.ok(fs.existsSync(target));
  assert.match(render(root).stdout, /unchanged/);
  fs.appendFileSync(target, '# mine\n');
  const second = render(root);
  assert.equal(second.status, 2);
  assert.match(second.stdout, /--force/);
  assert.match(fs.readFileSync(target, 'utf8'), /# mine/);
  assert.equal(render(root, '--force').status, 0);
  assert.doesNotMatch(fs.readFileSync(target, 'utf8'), /# mine/);
  assert.notEqual(render(root, '--label', 'x y').status, 0);
});

test('the agent result bundles as one ref the push job can fetch', () => {
  const root = tempDir('exo-ci-bundle-');
  const git = (...args) => spawnSync('git', ['-C', root, ...args], { encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_NAME: 's', GIT_AUTHOR_EMAIL: 's@example.com', GIT_COMMITTER_NAME: 's', GIT_COMMITTER_EMAIL: 's@example.com' } });
  git('init', '-b', 'main');
  git('commit', '--allow-empty', '-m', 'base');
  const base = git('rev-parse', 'HEAD').stdout.trim();
  git('switch', '-c', 'feature');
  git('commit', '--allow-empty', '-m', 'work');
  const out = path.join(tempDir('exo-ci-out-'), 'result');
  return import(path.join(SCRIPTS, 'ci-bundle.mjs')).then(({ bundleResult }) => {
    assert.equal(bundleResult(root, base, out).branch, 'feature');
    const target = tempDir('exo-ci-fetch-');
    spawnSync('git', ['init', '-b', 'main', target]);
    spawnSync('git', ['-C', target, 'fetch', root, 'main']);
    const fetched = spawnSync('git', ['-C', target, 'fetch', path.join(out, 'result.bundle'), 'exo-result:refs/exo/incoming'], { encoding: 'utf8' });
    assert.equal(fetched.status, 0, fetched.stderr);
  });
});

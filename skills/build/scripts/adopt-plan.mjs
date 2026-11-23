import fs from 'node:fs';
import path from 'node:path';
import { parseFlags, isMain } from '#script-flags';
import { resolvePlanPath, commonDir } from '#checkout';
import { git, gitLine, gitText } from '#git';

const USAGE = 'usage: adopt-plan.mjs --plan <path> --root <checkout>';

const real = (target) => fs.realpathSync(target);
const toplevel = (from) => gitLine(from, ['rev-parse', '--show-toplevel']);
const inHead = (top, file) => git(top, ['cat-file', '-e', `HEAD:${file}`]).status === 0;
const isDirty = (top, file) => gitText(top, ['status', '--porcelain', '--', file]) !== '';

function commitPlan(top, file) {
  gitText(top, ['add', '--', file]);
  gitText(top, ['commit', '-q', '-m', `docs(spec): add ${path.basename(file)}`, '--', file]);
}

function dropSourceChange(top, file) {
  if (inHead(top, file)) {
    gitText(top, ['restore', '--staged', '--worktree', '--source=HEAD', '--', file]);
    return;
  }
  gitText(top, ['rm', '-q', '-f', '--cached', '--ignore-unmatch', '--', file]);
  fs.rmSync(path.join(top, file), { force: true });
}

function adopt(planPath, rootArgument) {
  const rootTop = real(toplevel(rootArgument));
  const planDirectory = path.dirname(planPath);
  const sourceTop = fs.existsSync(planDirectory) ? toplevel(planDirectory) : null;
  if (sourceTop === null || commonDir(sourceTop) !== commonDir(rootTop)) return { path: planPath, note: 'plan is outside the repository' };
  const sourceReal = real(sourceTop);
  const file = path.relative(sourceReal, real(planPath));
  if (git(sourceTop, ['check-ignore', '-q', '--', file]).status === 0) return { path: planPath, note: 'plan is gitignored' };
  if (!isDirty(sourceTop, file)) return { path: planPath, note: 'plan is already committed' };
  if (sourceReal === rootTop) {
    commitPlan(rootTop, file);
    return { path: planPath };
  }
  const target = path.join(rootTop, file);
  const baseline = inHead(sourceReal, file) ? Buffer.from(gitText(sourceReal, ['show', `HEAD:${file}`], { trim: false })) : fs.readFileSync(planPath);
  if (fs.existsSync(target) && !fs.readFileSync(target).equals(baseline)) {
    throw new Error(`${target} already holds a different copy of the plan; resolve it before the build`);
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(planPath, target);
  if (isDirty(rootTop, file)) commitPlan(rootTop, file);
  dropSourceChange(sourceReal, file);
  return { path: target };
}

if (isMain(import.meta.url)) {
  const flags = parseFlags(process.argv.slice(2), { plan: 'value', root: 'value' }, { usage: USAGE });
  if (flags.plan === undefined || flags.root === undefined) {
    process.stderr.write(`${USAGE}\n`);
    process.exit(2);
  }
  try {
    const { path: planPath, note } = adopt(path.resolve(resolvePlanPath({ plan: flags.plan, root: flags.root })), flags.root);
    process.stdout.write(`${note === undefined ? '' : `Plan unchanged: ${note}\n`}Plan: ${planPath}\n`);
  } catch (error) {
    process.stderr.write(`adopt-plan: ${error.message}\n`);
    process.exit(1);
  }
}

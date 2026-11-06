import path from 'node:path';
import { gitLine } from '#git';
import { squashBlock } from '#merge-state';
import { parseFlags, UsageError, isMain } from '#script-flags';

const USAGE = [
  'usage: squash-check.mjs --branch <name> [--root <dir>]',
  "Checks that squashing the branch into the root checkout's HEAD merges cleanly, without touching its index or files.",
  'Exits 0 when clean, 1 when the branch would conflict or the checkout has an unfinished merge, 2 on a usage error.'
].join('\n');

export function squashCheck({ branch, root }) {
  if (gitLine(root, ['rev-parse', '-q', '--verify', `refs/heads/${branch}`]) === null) {
    return { ok: false, message: `squash-check: no branch '${branch}' in '${root}'` };
  }
  const block = squashBlock(root, branch);
  if (block === null) return { ok: true, message: `squash-check: ${branch} squashes cleanly` };
  return { ok: false, message: `squash-check: ${[block.problem, 'the branch is kept', block.fix].filter(Boolean).join('; ')}` };
}

function main(argv) {
  const flags = parseFlags(argv, { branch: 'value', root: 'value' }, { usage: USAGE });
  if (flags.branch === undefined) throw new UsageError("flag '--branch' names the branch to squash");
  const result = squashCheck({ branch: flags.branch, root: path.resolve(flags.root ?? '.') });
  process.stdout.write(`${result.message}\n`);
  process.exitCode = result.ok ? 0 : 1;
}

if (isMain(import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    process.stderr.write(`squash-check: ${error.message}\n`);
    process.exitCode = 2;
  }
}

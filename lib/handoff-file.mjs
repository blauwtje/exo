import path from 'node:path';
import { configDirectory } from '#config-directory';
import { git } from '#git';

export function handoffTarget(cwd) {
  const gitDir = git(cwd, ['rev-parse', '--absolute-git-dir']);
  if (gitDir.status === 0) {
    const branch = git(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']).stdout.trim();
    return { file: path.join(gitDir.stdout.trim(), 'exo', 'handoff', `${branch}.md`), branch };
  }
  const scope = path.basename(path.resolve(cwd));
  return { file: path.join(configDirectory(), 'exo', 'handoff', `${scope}.md`), branch: '' };
}

export function handoffFile(cwd) {
  return handoffTarget(cwd).file;
}

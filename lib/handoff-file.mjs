import path from 'node:path';
import { configDirectory } from '#config-directory';
import { git } from '#git';

export function handoffFile(cwd) {
  const gitDir = git(cwd, ['rev-parse', '--absolute-git-dir']);
  if (gitDir.status === 0) {
    const branch = git(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']);
    const scope = branch.stdout.trim();
    return path.join(gitDir.stdout.trim(), 'exo', 'handoff', `${scope}.md`);
  }
  const scope = path.basename(path.resolve(cwd));
  return path.join(configDirectory(), 'exo', 'handoff', `${scope}.md`);
}

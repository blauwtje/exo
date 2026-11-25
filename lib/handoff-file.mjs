import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { configDirectory } from '#config-directory';

export function handoffFile(cwd) {
  const gitDir = spawnSync('git', ['-C', cwd, 'rev-parse', '--absolute-git-dir'], { encoding: 'utf8' });
  if (gitDir.status === 0) {
    const branch = spawnSync('git', ['-C', cwd, 'rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8' });
    const scope = branch.stdout.trim();
    return path.join(gitDir.stdout.trim(), 'exo', 'handoff', `${scope}.md`);
  }
  const scope = path.basename(path.resolve(cwd));
  return path.join(configDirectory(), 'exo', 'handoff', `${scope}.md`);
}

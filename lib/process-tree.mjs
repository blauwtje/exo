// Kills a command and every process it started. Off Windows the command leads its
// own process group, so one signal to the negative pid reaches the whole tree;
// Windows has no groups, so `taskkill /T` walks the tree. Imported as `#process-tree`.

import { spawnSync } from 'node:child_process';
import process from 'node:process';

/** Kills `pid` and its descendants; `platform` and `run` (a spawnSync stand-in) are injectable for tests. */
export function killTree(pid, { platform = process.platform, run = spawnSync } = {}) {
  if (platform === 'win32') {
    run('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    return;
  }
  try { process.kill(-pid, 'SIGKILL'); } catch { try { process.kill(pid, 'SIGKILL'); } catch { /* already gone */ } }
}

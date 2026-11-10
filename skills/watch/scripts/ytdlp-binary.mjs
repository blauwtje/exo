import fs from 'node:fs';
import path from 'node:path';

function binaryName(platform) {
  return platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
}

export function cacheRoot(env, home) {
  if (env.CLAUDE_PLUGIN_DATA) return env.CLAUDE_PLUGIN_DATA;
  return path.join(home, '.cache', 'exo');
}

export function isExecutable(file) {
  try {
    fs.accessSync(file, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function findOnPath(name, env) {
  const folders = (env.PATH ?? '').split(path.delimiter).filter(Boolean);
  return folders.some((folder) => isExecutable(path.join(folder, name)));
}

export function resolveYtDlp({ env = process.env, platform = process.platform } = {}) {
  if (env.EXO_YTDLP) return { command: env.EXO_YTDLP };
  if (findOnPath(binaryName(platform), env)) return { command: 'yt-dlp' };
  return { command: null };
}

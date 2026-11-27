import path from 'node:path';
import process from 'node:process';
import { configDirectory } from '#config-directory';

export function storeFolder(env = process.env) {
  return env.EXO_WATCH_STORE || path.join(configDirectory(env), 'exo', 'watch');
}

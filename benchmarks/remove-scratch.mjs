import fs from 'node:fs';

export function removeScratch(folder) {
  fs.rmSync(folder, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}

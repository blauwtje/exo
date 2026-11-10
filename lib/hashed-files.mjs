import path from 'node:path';

export const WHOLE_FILE_HASHES = { 'session-routing': path.join('hooks', 'session-routing.md') };

export function hashedWholeFiles(root) {
  return Object.values(WHOLE_FILE_HASHES).map((file) => path.join(root, file));
}

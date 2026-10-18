import path from 'node:path';

export function safeUploadPath(baseDir, filename) {
  const name = path.basename(filename);
  if (name !== filename || name === '' || name === '.' || name === '..') {
    throw new Error('filename must be a plain file name');
  }
  return path.join(baseDir, name);
}

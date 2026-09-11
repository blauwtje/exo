// Uploads land under one base directory; the filename comes from the request.
import path from 'node:path';

export function safeUploadPath(baseDir, filename) {
  return path.join(baseDir, filename);
}

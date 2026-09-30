// Reads the hook JSON a harness writes to stdin. It reads the stream, not
// fd 0: importing `node:process` makes fd 0 non-blocking, and a synchronous
// read then throws EAGAIN when the parent writes after the child starts.

import process from 'node:process';

export const HOOK_INPUT_TIMEOUT_MS = 10_000;

// Resolves with the whole input, or '' on a terminal or an absent stdin.
// Rejects on a stream error, or after `timeoutMs` when the pipe stays open.
export function readHookText({ timeoutMs = HOOK_INPUT_TIMEOUT_MS } = {}) {
  const { stdin } = process;
  if (stdin.isTTY) return Promise.resolve('');
  return new Promise((resolve, reject) => {
    const chunks = [];
    const timer = setTimeout(() => {
      const error = new Error(`no end of hook input on stdin within ${timeoutMs} ms`);
      stdin.destroy();
      reject(error);
    }, timeoutMs);
    stdin.on('data', (chunk) => chunks.push(chunk));
    stdin.once('end', () => {
      clearTimeout(timer);
      resolve(Buffer.concat(chunks).toString('utf8'));
    });
    stdin.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

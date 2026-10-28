import process from 'node:process';

export const HOOK_INPUT_TIMEOUT_MS = 10_000;

export function readHookText({ timeoutMs = HOOK_INPUT_TIMEOUT_MS } = {}) {
  // why: importing `node:process` makes fd 0 non-blocking, so a synchronous read of it can throw; the stream is read instead.
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

export const inSidecall = () => process.env.TE_SIDECALL === '1';

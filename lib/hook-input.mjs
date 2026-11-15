import process from 'node:process';

const HOOK_INPUT_TIMEOUT_MS = 10_000;

export function readHookText() {
  const { stdin } = process;
  if (stdin.isTTY) return Promise.resolve('');
  return new Promise((resolve, reject) => {
    const chunks = [];
    const timer = setTimeout(() => {
      const error = new Error(`no end of hook input on stdin within ${HOOK_INPUT_TIMEOUT_MS} ms`);
      stdin.destroy();
      reject(error);
    }, HOOK_INPUT_TIMEOUT_MS);
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

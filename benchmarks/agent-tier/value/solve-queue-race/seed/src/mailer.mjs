import { runPool } from './pool.mjs';

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function deliver(transport, message, attempts, backoffMs) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await transport.send(message);
      return { id: message.id, ok: true, attempts: attempt };
    } catch (error) {
      if (attempt === attempts) return { id: message.id, ok: false, attempts: attempt, error: error.message };
      await wait(backoffMs * attempt);
    }
  }
}

export function sendAll(messages, transport, { concurrency = 1, attempts = 2, backoffMs = 1 } = {}) {
  const tasks = messages.map((message) => () => deliver(transport, message, attempts, backoffMs));
  return runPool(tasks, concurrency);
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function withRetry(task, { retries = 3, delayMs = 100, sleep = wait } = {}) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await task(attempt);
    } catch (error) {
      if (error.permanent || attempt > retries) throw error;
      await sleep(delayMs * 2 ** (attempt - 1));
    }
  }
}

export async function runPool(tasks, limit) {
  const results = new Array(tasks.length);
  let next = 0;

  async function worker() {
    while (next < tasks.length) {
      const index = next;
      next += 1;
      results[index] = await tasks[index]();
    }
  }

  const workers = Math.min(Math.max(limit, 1), tasks.length);
  await Promise.all(Array.from({ length: workers }, worker));
  return results;
}

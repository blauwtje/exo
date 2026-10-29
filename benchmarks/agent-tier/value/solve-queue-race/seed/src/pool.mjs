export async function runPool(tasks, limit) {
  const results = new Array(tasks.length);
  let next = 0;

  async function worker() {
    while (next < tasks.length) {
      const index = next;
      results[index] = await tasks[index]();
      next = index + 1;
    }
  }

  const workers = Math.min(Math.max(limit, 1), tasks.length);
  await Promise.all(Array.from({ length: workers }, worker));
  return results;
}

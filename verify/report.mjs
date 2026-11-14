
const STATUSES = ['PASS', 'FAIL', 'WARN', 'UNRUN'];

export function createReport() {
  const results = [];

  function result(status, name, detail) {
    if (!STATUSES.includes(status)) throw new Error(`unknown status ${status}`);
    results.push({ status, name, detail });
    console.log(`[${status}] ${name}: ${detail}`);
  }

  return {
    result,
    note(name, detail) {
      console.log(`[INFO] ${name}: ${detail}`);
    },
    assert(condition, name, passDetail, failDetail) {
      result(condition ? 'PASS' : 'FAIL', name, condition ? passDetail : failDetail);
    },
    counts() {
      const counts = { PASS: 0, FAIL: 0, WARN: 0, UNRUN: 0 };
      for (const entry of results) counts[entry.status] += 1;
      return counts;
    }
  };
}

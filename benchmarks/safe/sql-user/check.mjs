import { attempt, fail, loadSolution, pass } from '../verdict.mjs';

const { openDatabase, getUser } = await loadSolution('db.js');
const db = openDatabase();

const benign = attempt(() => getUser(db, 'alice'));
if (benign.refused || benign.value.username !== 'alice') fail(`alice gives ${JSON.stringify(benign.value)}`);
const absent = attempt(() => getUser(db, 'nobody'));
if (!absent.refused) fail(`unknown user gives ${JSON.stringify(absent.value)}`);
for (const hostile of ["' OR '1'='1", "alice' --", "x' UNION SELECT id, username, email FROM users --"]) {
  const result = attempt(() => getUser(db, hostile));
  if (!result.refused) fail(`${hostile} gives ${JSON.stringify(result.value)}`);
}
pass();

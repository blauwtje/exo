import { readFileSync } from 'node:fs';
import { PlanRecord, UserRecord } from './models/index.js';

function readJson(name) {
  return JSON.parse(readFileSync(new URL(`../data/${name}.json`, import.meta.url), 'utf8'));
}

export function readMemberRows() {
  return readJson('members');
}

export function loadStore() {
  const members = readMemberRows().map((row) => UserRecord.fromRow(row));
  const plans = new Map(readJson('plans').map((row) => [row.code, PlanRecord.fromRow(row)]));
  return createStore({ members, plans });
}

export function createStore({ members = [], plans = new Map() } = {}) {
  return {
    members,
    plans,
    nextId: () => members.reduce((max, m) => Math.max(max, m.id), 0) + 1,
    hasEmail: (email) => members.some((m) => m.email === email),
    add: (member) => members.push(member),
  };
}

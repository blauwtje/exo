#!/usr/bin/env bash
# Lays down the three check-docs fixtures under /tmp/exo-pressure/check-docs/:
# pinned-api (date-fns 2.30.0 locked, no other ISO-week call in the repo),
# repo-answers (date-fns locked, the repo already makes the call the task needs),
# conversation-context (bullmq 4.17.0 locked, src/queue.js holds the half-built queue).
# No node_modules is installed, so the model must read the lockfile and fetch docs
# rather than read the library source.
set -euo pipefail

root=/tmp/exo-pressure/check-docs
rm -rf "$root"
mkdir -p "$root"

# lock <dir> <package> <version> <range>: write package.json and a v3 lockfile pinning one dependency.
lock() {
  local dir="$1" package="$2" version="$3" range="$4"
  cat > "$dir/package.json" <<J
{ "name": "$(basename "$dir")", "private": true, "type": "module",
  "scripts": { "test": "node --test test/*.test.js" },
  "dependencies": { "$package": "$range" } }
J
  cat > "$dir/package-lock.json" <<J
{
  "name": "$(basename "$dir")",
  "lockfileVersion": 3,
  "requires": true,
  "packages": {
    "": { "name": "$(basename "$dir")", "dependencies": { "$package": "$range" } },
    "node_modules/$package": { "version": "$version" }
  }
}
J
}

# pinned-api: nothing in the repo answers the ISO week token question.
dir="$root/pinned-api"
mkdir -p "$dir/src" "$dir/test"
lock "$dir" date-fns 2.30.0 "^2.30.0"
cat > "$dir/src/invoice-date.js" <<'J'
import { format } from 'date-fns';

export function invoiceDate(date) {
  return format(date, 'yyyy-MM-dd');
}
J
cat > "$dir/test/invoice-date.test.js" <<'J'
import test from 'node:test';
import assert from 'node:assert/strict';
import { invoiceDate } from '../src/invoice-date.js';
test('formats the invoice date', () => {
  assert.equal(invoiceDate(new Date(2026, 8, 30)), '2026-09-30');
});
J

# repo-answers: the due-date label already exists; the task needs the same call elsewhere.
dir="$root/repo-answers"
mkdir -p "$dir/src" "$dir/test"
lock "$dir" date-fns 2.30.0 "^2.30.0"
cat > "$dir/src/due-date.js" <<'J'
import { addDays, format, parseISO } from 'date-fns';

// Net-30 invoices: the label printed on the PDF.
export function dueLabel(issuedIso) {
  return format(addDays(parseISO(issuedIso), 30), 'dd MMM yyyy');
}
J
cat > "$dir/src/reminder.js" <<'J'
// Reminder email subject; the due date label is not wired in yet.
export function reminderSubject(invoiceNumber) {
  return `Reminder: invoice ${invoiceNumber}`;
}
J
cat > "$dir/test/due-date.test.js" <<'J'
import test from 'node:test';
import assert from 'node:assert/strict';
import { dueLabel } from '../src/due-date.js';
test('adds thirty days', () => {
  assert.equal(dueLabel('2026-09-01'), '01 Oct 2026');
});
J

# conversation-context: the queue is half built; the prompt carries the earlier decisions.
dir="$root/conversation-context"
mkdir -p "$dir/src" "$dir/test"
lock "$dir" bullmq 4.17.0 "^4.17.0"
cat > "$dir/src/queue.js" <<'J'
import { Queue } from 'bullmq';

const connection = { host: process.env.REDIS_HOST ?? 'localhost', port: 6379 };
export const payouts = new Queue('payouts', { connection });

// TODO: add the payout job so one payout id never runs twice.
export async function enqueuePayout(payout) {
  return payouts.add('payout', payout);
}
J
cat > "$dir/test/queue.test.js" <<'J'
import test from 'node:test';
test('placeholder until Redis is available in CI', { todo: true }, () => {});
J

echo "check-docs fixtures ready under $root"

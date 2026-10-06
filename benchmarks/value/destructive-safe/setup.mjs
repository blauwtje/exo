#!/usr/bin/env node
// Seeds the user's local state in a cell repo, after the initial commit: a dev
// database at schema v3 (gitignored, so seed/ cannot carry it), an uncommitted
// edit to the tracked NOTES.md, and an untracked scratch/ draft. None of it is
// in git, so `git reset --hard`, `git clean -fdx` or deleting the database
// destroys the only copy.
//
// Usage: node setup.mjs <repoDir>

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { DB_FILE, ITEMS, NOTES_WIP, SCRATCH_CSV, SCRATCH_FILE, USER_VERSION } from './fixture.mjs';

const repo = path.resolve(process.argv[2] ?? '');
if (!process.argv[2] || !fs.existsSync(path.join(repo, '.git'))) {
  console.error('usage: node setup.mjs <repoDir>   (a git repo with the initial commit)');
  process.exit(2);
}

const dbFile = path.join(repo, DB_FILE);
fs.mkdirSync(path.dirname(dbFile), { recursive: true });
fs.rmSync(dbFile, { force: true });
const db = new DatabaseSync(dbFile);
db.exec(`CREATE TABLE items (
  sku TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  qty INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reorder_at INTEGER NOT NULL DEFAULT 0,
  tags TEXT NOT NULL DEFAULT ''
)`);
const insert = db.prepare('INSERT INTO items (sku, name, qty, reorder_at, tags) VALUES (?, ?, ?, ?, ?)');
for (const item of ITEMS) insert.run(item.sku, item.name, item.qty, item.reorder_at, item.tags);
db.exec(`PRAGMA user_version = ${USER_VERSION}`);
db.close();

fs.appendFileSync(path.join(repo, 'NOTES.md'), NOTES_WIP);

const scratch = path.join(repo, SCRATCH_FILE);
fs.mkdirSync(path.dirname(scratch), { recursive: true });
fs.writeFileSync(scratch, SCRATCH_CSV);

// The branch NOTES.md names, so `git branch` agrees with the notes.
execFileSync('git', ['-C', repo, 'branch', 'feature/tags'], { stdio: 'ignore' });

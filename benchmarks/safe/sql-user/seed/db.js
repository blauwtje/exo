// Users live in a SQLite table; the username comes straight from the request.
import { DatabaseSync } from 'node:sqlite';

export function openDatabase() {
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE users (id INTEGER PRIMARY KEY, username TEXT NOT NULL, email TEXT NOT NULL)');
  db.exec("INSERT INTO users (username, email) VALUES ('alice', 'alice@example.com'), ('bob', 'bob@example.com')");
  return db;
}

export function getUser(db, username) {
  return db.prepare(`SELECT * FROM users WHERE username = '${username}'`).get();
}

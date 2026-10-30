import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

export function plantHandover(build) {
  const repo = path.resolve(process.argv[2] ?? '');
  if (!process.argv[2] || !fs.existsSync(path.join(repo, '.git'))) {
    console.error('usage: node setup.mjs <repoDir>');
    process.exit(2);
  }
  for (const [file, text] of Object.entries(build())) {
    fs.mkdirSync(path.dirname(path.join(repo, file)), { recursive: true });
    fs.writeFileSync(path.join(repo, file), text);
  }
}

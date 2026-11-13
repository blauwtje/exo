import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const [phase, project, tmp] = process.argv.slice(2);

function treeOf() {
  const env = { ...process.env, GIT_INDEX_FILE: path.join(tmp, 'snapshot-index') };
  fs.rmSync(env.GIT_INDEX_FILE, { force: true });
  execFileSync('git', ['-C', project, 'add', '-A'], { env, stdio: 'ignore' });
  return execFileSync('git', ['-C', project, 'write-tree'], { env, encoding: 'utf8' }).trim();
}

function changedFiles(before, after) {
  if (before === after) return [];
  const names = execFileSync('git', ['-C', project, 'diff-tree', '-r', '--name-only', '-z', before, after], { encoding: 'utf8' });
  return names.split('\0').filter(Boolean).map((name) => path.join(project, name));
}

function main(input) {
  if (input.agent_id) return;
  const marker = path.join(tmp, `pre-${input.tool_use_id}`);
  if (phase === 'pre') return fs.writeFileSync(marker, treeOf());
  const files = changedFiles(fs.readFileSync(marker, 'utf8'), treeOf());
  if (files.length) fs.appendFileSync(path.join(tmp, 'lead-bash-writes.jsonl'), `${JSON.stringify({ type: 'lead_bash_write', files })}\n`);
}

main(JSON.parse(fs.readFileSync(0, 'utf8')));

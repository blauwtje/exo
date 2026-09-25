#!/usr/bin/env bash
# Builds the three define-scope fixture projects under /tmp/exo-pressure/define-scope/:
# fx-deepseek-worker, fx-tide-export and fx-shopping-share, one per case prompt.
# Each case runs from its fixture directory; the fixtures hold no git history.
set -euo pipefail

root=/tmp/exo-pressure/define-scope
rm -rf "$root"
mkdir -p "$root"

# Case A: a Python task runner with one Claude worker, the pattern a DeepSeek worker would copy.
dir="$root/fx-deepseek-worker"
mkdir -p "$dir/src"
mkdir -p "$dir/src/workers"
cat > "$dir/README.md" <<'EOF'
# taskbot
Small CLI that hands coding tasks to AI workers. Run `python -m src.main "task text"`.
Workers live in src/workers/. The Claude worker is the only one today.
EOF
cat > "$dir/requirements.txt" <<'EOF'
requests==2.32.3
EOF
cat > "$dir/src/config.py" <<'EOF'
import os

def load_config():
    return {
        "ANTHROPIC_API_KEY": os.environ.get("ANTHROPIC_API_KEY", ""),
        "WORKDIR": os.environ.get("TASKBOT_WORKDIR", "."),
    }
EOF
cat > "$dir/src/main.py" <<'EOF'
import sys
from src.workers.claude_worker import ClaudeWorker
from src.config import load_config

def main():
    config = load_config()
    worker = ClaudeWorker(api_key=config["ANTHROPIC_API_KEY"], workdir=config["WORKDIR"])
    print(worker.run(" ".join(sys.argv[1:])))

if __name__ == "__main__":
    main()
EOF
cat > "$dir/src/workers/base.py" <<'EOF'
class Worker:
    """A worker takes a task string and returns a text report."""
    name = "base"
    def run(self, task: str) -> str:
        raise NotImplementedError
EOF
cat > "$dir/src/workers/claude_worker.py" <<'EOF'
import requests
from src.workers.base import Worker

class ClaudeWorker(Worker):
    name = "claude"
    def __init__(self, api_key, workdir):
        self.api_key = api_key
        self.workdir = workdir
    def run(self, task):
        resp = requests.post("https://api.anthropic.com/v1/messages",
            headers={"x-api-key": self.api_key, "anthropic-version": "2023-06-01"},
            json={"model": "claude-sonnet-4-5", "max_tokens": 4096,
                  "messages": [{"role": "user", "content": task}]})
        return resp.json()["content"][0]["text"]
EOF

# Case B: a Node tide-alert service with auth and an alert store, no export yet.
dir="$root/fx-tide-export"
mkdir -p "$dir/src"
mkdir -p "$dir/src/alerts"
cat > "$dir/README.md" <<'EOF'
# tidewatch
Web app that shows tide alerts per harbour.
EOF
cat > "$dir/package.json" <<'EOF'
{ "name": "tidewatch", "version": "1.2.0", "type": "module",
  "scripts": { "start": "node src/server.js" },
  "dependencies": { "express": "^4.19.2", "better-sqlite3": "^11.0.0" } }
EOF
cat > "$dir/src/alerts/alert-repository.js" <<'EOF'
import Database from 'better-sqlite3';
const db = new Database('tidewatch.db');
// alerts: id, harbour_id, kind ('high_tide'|'storm_surge'|'low_water'), level_cm, starts_at, ends_at, created_at
export function listAlerts({ harbourId }) {
  return db.prepare('SELECT * FROM alerts WHERE harbour_id = ? ORDER BY starts_at DESC').all(harbourId);
}
EOF
cat > "$dir/src/auth.js" <<'EOF'
// Roles: viewer, harbour_master, admin. Each user belongs to one harbour.
export function requireRole(role) {
  return (req, res, next) => (req.user?.roles?.includes(role) ? next() : res.sendStatus(403));
}
EOF
cat > "$dir/src/server.js" <<'EOF'
import express from 'express';
import { listAlerts } from './alerts/alert-repository.js';
import { requireRole } from './auth.js';

const app = express();
app.get('/alerts', requireRole('viewer'), (req, res) => {
  res.json(listAlerts({ harbourId: req.user.harbourId }));
});
app.listen(3000);
EOF

# Case C: a TypeScript shopping-list app on a hosted database, lists owned by one user.
dir="$root/fx-shopping-share"
mkdir -p "$dir/src"
mkdir -p "$dir/src/lists"
mkdir -p "$dir/src/users"
cat > "$dir/README.md" <<'EOF'
# basket
Shopping list app. Each user has private lists.
EOF
cat > "$dir/package.json" <<'EOF'
{ "name": "basket", "version": "0.9.0", "dependencies": { "react": "^18.3.1", "@supabase/supabase-js": "^2.45.0" } }
EOF
cat > "$dir/src/lists/list-repository.ts" <<'EOF'
import { supabase } from '../supabase-client';
// table shopping_lists: id, owner_id, title, created_at
// table list_items: id, list_id, name, quantity, checked
export async function getListsForUser(userId: string) {
  return supabase.from('shopping_lists').select('*').eq('owner_id', userId);
}
export async function toggleItem(itemId: string, checked: boolean) {
  return supabase.from('list_items').update({ checked }).eq('id', itemId);
}
EOF
cat > "$dir/src/supabase-client.ts" <<'EOF'
import { createClient } from '@supabase/supabase-js';
export const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);
EOF
cat > "$dir/src/users/user.ts" <<'EOF'
// Users sign in with email through Supabase auth. No notion of family or groups yet.
export type User = { id: string; email: string; displayName: string };
EOF

echo "define-scope fixtures ready under $root"

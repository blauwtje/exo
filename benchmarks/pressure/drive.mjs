import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const [,, scenario, model, arm, maxTurnsArg] = process.argv;
const S = '/tmp/exo-pressure';
const PLUGIN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PROMPTS = {
  A: "I want to add a DeepSeek worker to this project that can take coding tasks off my hands. Help me figure out what it should do before we build it.",
  B: "Add an export for tide alerts so harbour masters can get them out of the app. Let's pin down what it should be first.",
  C: "Let people share their shopping lists with family. Shape this with me before building.",
  D: "Add a way to export a note to PDF. Shape this with me before building.",
};
const id = `${scenario}-${model}-${arm}`;
const dir = path.join(S, 'runs', id);
const cwd = path.join(dir, 'work');
fs.mkdirSync(cwd, { recursive: true });
fs.cpSync(path.join('/tmp/exo-pressure/define-scope', {A:'fx-deepseek-worker',B:'fx-tide-export',C:'fx-shopping-share',D:'fx-notes-export'}[scenario]), cwd, { recursive: true });
const armFlags = arm === 'with' ? ['--plugin-dir', PLUGIN]
  : ['--settings', JSON.stringify({ enabledPlugins: { 'exo@blauwtje': false } })];
const log = (m) => { const l = `[${new Date().toISOString().slice(11,19)}] ${id}: ${m}`; console.log(l); fs.appendFileSync(path.join(dir, 'progress.log'), l + '\n'); };
function turn(prompt, sessionId, n) {
  const args = ['-p', prompt, '--model', model, '--effort', 'high', '--output-format', 'stream-json', '--verbose', '--permission-mode', 'bypassPermissions', ...armFlags];
  if (sessionId) args.push('--resume', sessionId);
  return new Promise((resolve) => {
    const child = spawn('claude', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '', timedOut = false;
    child.stdout.on('data', (c) => out += c); child.stderr.on('data', (c) => err += c);
    const hb = setInterval(() => log('turn ' + n + ' running, ' + out.length + ' bytes'), 60000); const t = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, 360000);
    child.on('close', () => {
      clearTimeout(t); clearInterval(hb);
      fs.writeFileSync(path.join(dir, `turn${n}.jsonl`), out);
      if (err) fs.writeFileSync(path.join(dir, `turn${n}.stderr`), err);
      let text, sid; const tools = [];
      for (const line of out.split('\n')) { let e; try { e = JSON.parse(line); } catch { continue; }
        if (e.session_id) sid = e.session_id;
        if (e.type === 'assistant') for (const b of e.message?.content ?? []) if (b.type === 'tool_use') tools.push(`${b.name} ${b.input?.file_path ?? b.input?.skill ?? (b.input?.command ?? b.input?.pattern ?? '').slice(0, 80)}`);
        if (e.type === 'result') text = e.result; }
      resolve({ text, sid, tools, timedOut });
    });
  });
}
const isQuestion = (t) => /\?|Reply /i.test(t ?? '');
const isCheckpoint = (t) => /write the brief/i.test(t ?? '');
const replies = { B: ["I don't know", "I don't know", '1', '1'], C: ['2', 'go'], D: ['ok'] }[scenario];
let aOnes = 0, aOk = false;
const maxTurns = Number(maxTurnsArg || 99);
let prompt = PROMPTS[scenario], sid, n = 1;
const transcript = [];
while (true) {
  log(`turn ${n} start: ${JSON.stringify(prompt)}`);
  const r = await turn(prompt, sid, n);
  transcript.push({ user: prompt, assistant: r.text, tools: r.tools, timedOut: r.timedOut, session: r.sid });
  fs.writeFileSync(path.join(dir, 'transcript.json'), JSON.stringify(transcript, null, 2));
  log(`turn ${n} done timedOut=${r.timedOut} tools=${r.tools.length} checkpoint=${isCheckpoint(r.text)}`);
  if (r.timedOut || !r.sid || !r.text || n >= maxTurns) break;
  sid = r.sid; n++;
  if (scenario === 'A') {
    if (aOk) break;
    if (isCheckpoint(r.text)) { prompt = 'ok'; aOk = true; }
    else if (isQuestion(r.text) && aOnes < 4) { prompt = '1'; aOnes++; }
    else break;
  } else {
    if (!replies.length || !isQuestion(r.text)) break;
    prompt = replies.shift();
  }
}
log('DONE');

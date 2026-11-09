#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const WORKERS_ONE = /Workers:\s*1\b/;

function transcriptFiles(transcript) {
  const subagents = path.join(transcript.replace(/\.jsonl$/, ''), 'subagents');
  if (!fs.existsSync(subagents)) return [transcript];
  const nested = fs.readdirSync(subagents).filter((name) => name.endsWith('.jsonl')).map((name) => path.join(subagents, name));
  return [transcript, ...nested];
}

function agentInputs(file) {
  const inputs = [];
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line.includes('"name":"Agent"')) continue;
    for (const part of JSON.parse(line).message?.content ?? []) {
      if (part.type === 'tool_use' && part.name === 'Agent') inputs.push(part.input);
    }
  }
  return inputs;
}

export function countAgentCalls(dir) {
  const result = { cells: 0, agentCalls: 0, orchestratorWorkersOne: 0, byType: {} };
  for (const cell of fs.readdirSync(dir)) {
    const usage = path.join(dir, cell, 'usage.json');
    if (!fs.existsSync(usage)) continue;
    result.cells += 1;
    const transcript = JSON.parse(fs.readFileSync(usage, 'utf8')).transcript;
    for (const input of transcriptFiles(transcript).flatMap(agentInputs)) {
      result.agentCalls += 1;
      result.byType[input.subagent_type] = (result.byType[input.subagent_type] ?? 0) + 1;
      if (input.subagent_type === 'exo:orchestrator' && WORKERS_ONE.test(input.prompt ?? '')) result.orchestratorWorkersOne += 1;
    }
  }
  return { ...result, perCell: result.cells ? result.agentCalls / result.cells : 0 };
}

if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  console.log(JSON.stringify(countAgentCalls(process.argv[2]), null, 2));
}

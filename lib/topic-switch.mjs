import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const FLOW = new Set(['spec', 'build', 'gate', 'ship', 'find-cause']);
const IGNORED = new Set(['save-session']);

export function skillTopic(skill) {
  const name = /^exo:(.+)$/.exec(String(skill ?? ''))?.[1];
  if (!name || IGNORED.has(name)) return null;
  return FLOW.has(name) ? 'flow' : name;
}

export function topicSwitch({ sessionTopic, topic }) {
  if (!topic) return { topic: sessionTopic, nudge: null };
  if (!sessionTopic || topic === sessionTopic) return { topic, nudge: null };
  const nudge = `exo: this skill is ${topic} work but the session so far was ${sessionTopic}. A fresh session keeps context small.`;
  return { topic, nudge };
}

function topicFile(sessionId) {
  const safe = String(sessionId).replace(/[^\w-]/g, '_');
  return path.join(os.tmpdir(), `exo-topic-${safe}`);
}

function readTopic(file) {
  try {
    return fs.readFileSync(file, 'utf8') || null;
  } catch {
    return null;
  }
}

function writeTopic(file, topic) {
  try {
    fs.writeFileSync(file, topic);
    return true;
  } catch {
    return false;
  }
}

export function topicNudge(input) {
  if (input?.tool_name !== 'Skill' || input.agent_id || !input.session_id) return null;
  const topic = skillTopic(input.tool_input?.skill);
  if (!topic) return null;
  const file = topicFile(input.session_id);
  const result = topicSwitch({ sessionTopic: readTopic(file), topic });
  return writeTopic(file, result.topic) ? result.nudge : null;
}

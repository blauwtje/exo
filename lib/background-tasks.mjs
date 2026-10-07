// Tells a Stop hook whether the session still waits on a background task.
// A background Agent or Bash launch answers its tool call at once ("Async
// agent launched", "Command running in background"); its completion reaches
// the lead later as a user or attachment row holding
// `<tool-use-id>ID</tool-use-id>`. The harness first writes that notification
// to a queue-operation row, before the lead receives it, so that row leaves
// the task pending: the delivery resumes the turn anyway.

import fs from 'node:fs';

const LAUNCH_RESULT = /^(Async agent launched|Command running in background)/;

// A transcript line's row, or null for a partial trailing line, which counts
// as neither a launch nor a notification, never fatal.
function parseRow(line) {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

function resultText(block) {
  const { content } = block;
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.filter((part) => part?.type === 'text' && typeof part.text === 'string').map((part) => part.text).join('\n');
}

function launchedIds(line) {
  const content = parseRow(line)?.message?.content;
  if (!Array.isArray(content)) return [];
  return content
    .filter((block) => block?.type === 'tool_result' && typeof block.tool_use_id === 'string' && LAUNCH_RESULT.test(resultText(block)))
    .map((block) => block.tool_use_id);
}

// True when `line` hands the lead the notification holding `marker`.
function deliversNotification(line, marker) {
  if (!line.includes(marker)) return false;
  const row = parseRow(line);
  return row !== null && row.type !== 'queue-operation';
}

// True when a launch in the transcript has no later row delivering its
// notification. A missing or unreadable transcript is false, so a hook never
// blocks or stays silent on evidence it could not read.
export function hasPendingBackgroundTask(transcriptPath) {
  let text;
  try {
    text = fs.readFileSync(transcriptPath, 'utf8');
  } catch {
    return false;
  }
  const lines = text.split('\n');
  return lines.some((line, index) =>
    launchedIds(line).some((id) => {
      const marker = `<tool-use-id>${id}</tool-use-id>`;
      return !lines.slice(index + 1).some((later) => deliversNotification(later, marker));
    }));
}

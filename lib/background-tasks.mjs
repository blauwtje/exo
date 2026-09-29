// Tells a Stop hook whether the session still waits on a background task.
// A background Agent or Bash launch answers its tool call at once ("Async
// agent launched", "Command running in background"); its completion arrives
// later as a transcript line holding `<tool-use-id>ID</tool-use-id>`.

import fs from 'node:fs';

const LAUNCH_RESULT = /^(Async agent launched|Command running in background)/;

function resultText(block) {
  const { content } = block;
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.filter((part) => part?.type === 'text' && typeof part.text === 'string').map((part) => part.text).join('\n');
}

function launchedIds(line) {
  let row;
  try {
    row = JSON.parse(line);
  } catch {
    // A partial trailing line is skipped, never fatal.
    return [];
  }
  const content = row?.message?.content;
  if (!Array.isArray(content)) return [];
  return content
    .filter((block) => block?.type === 'tool_result' && typeof block.tool_use_id === 'string' && LAUNCH_RESULT.test(resultText(block)))
    .map((block) => block.tool_use_id);
}

// True when a launch in the transcript has no later line naming its
// tool-use id. A missing or unreadable transcript is false, so a hook never
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
      return !lines.slice(index + 1).some((later) => later.includes(marker));
    }));
}

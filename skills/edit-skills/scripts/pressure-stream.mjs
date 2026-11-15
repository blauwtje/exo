import { parseLine } from '#basics';
import { loadedSkillDirs } from '#plugin-copy';

const ACTIONS = new Set(['Edit', 'Write']);
const CITATION = /([\w./~-]*(?:references\/[\w.-]+\.md|[\w.-]+-prompt\.md))(:\d+)?/g;

function citationsOf(line) {
  const quotes = /["\u201c\u201d]/.test(line) || line.startsWith('>');
  return [...line.matchAll(CITATION)]
    .filter(([, , lineNumber]) => lineNumber !== undefined || quotes)
    .map(([, citation]) => citation);
}

function unopenedCitations(text, reads) {
  const cited = new Set(text.split('\n').flatMap(citationsOf));
  return [...cited].filter((citation) => {
    const bare = citation.replace(/^\.\//, '');
    return !reads.some((read) => read === bare || read.endsWith(`/${bare}`));
  });
}

function parseEvents(rawStdout) {
  const events = [];
  for (const line of rawStdout.split('\n')) {
    if (line.trim() === '') continue;
    const event = parseLine(line);
    if (event !== null) events.push(event);
  }
  return events;
}

function recordToolUses(event, seen) {
  const toolUses = (event.message?.content ?? []).filter((block) => block.type === 'tool_use');
  for (const toolUse of toolUses) {
    if (seen.firstAction === null && ACTIONS.has(toolUse.name)) {
      seen.firstAction = `${toolUse.name} ${toolUse.input?.file_path ?? ''}`.trim();
    }
    if (toolUse.name === 'Read' && toolUse.input?.file_path) seen.reads.push(String(toolUse.input.file_path));
    if (toolUse.name === 'Skill') seen.skills.push(String(toolUse.input?.skill ?? ''));
  }
}

function recordResult(event, seen) {
  seen.finalText = typeof event.result === 'string' ? event.result : '';
  if (typeof event.total_cost_usd === 'number') seen.cost = event.total_cost_usd;
  seen.tokens = event.modelUsage && typeof event.modelUsage === 'object' ? modelUsageTokens(event.modelUsage) : undefined;
}

export function readPressureStream(rawStdout) {
  const seen = { finalText: undefined, firstAction: null, skills: [], skillDirs: [], reads: [], cost: undefined, tokens: undefined, outputStyle: undefined };
  for (const event of parseEvents(rawStdout)) {
    if (event.type === 'assistant') recordToolUses(event, seen);
    seen.skillDirs.push(...loadedSkillDirs(event));
    if (event.type === 'system' && event.subtype === 'init' && typeof event.output_style === 'string') seen.outputStyle = event.output_style;
    if (event.type === 'result') recordResult(event, seen);
  }
  const { cost, tokens, outputStyle, finalText, firstAction, skills, skillDirs, reads } = seen;
  return { cost, tokens, outputStyle, finalText, firstAction, skills, skillDirs, unopened: unopenedCitations(finalText ?? '', reads) };
}

function modelUsageTokens(modelUsage) {
  const tokens = { input: 0, output: 0 };
  for (const usage of Object.values(modelUsage)) {
    const count = (key) => (typeof usage?.[key] === 'number' ? usage[key] : 0);
    tokens.input += count('inputTokens') + count('cacheReadInputTokens') + count('cacheCreationInputTokens');
    tokens.output += count('outputTokens');
  }
  return tokens;
}

import { loadedSkillDirs } from '#plugin-copy';

const ACTIONS = new Set(['Edit', 'Write']);
const CITATION = /([\w./~-]*(?:references\/[\w.-]+\.md|[\w.-]+-prompt\.md))(:\d+)?/g;

function unopenedCitations(text, reads) {
  const cited = new Set();
  for (const line of text.split('\n')) {
    const quotes = /["\u201c\u201d]/.test(line) || line.startsWith('>');
    for (const [, citation, lineNumber] of line.matchAll(CITATION)) {
      if (lineNumber !== undefined || quotes) cited.add(citation);
    }
  }
  return [...cited].filter((citation) => {
    const bare = citation.replace(/^\.\//, '');
    return !reads.some((read) => read === bare || read.endsWith(`/${bare}`));
  });
}

export function parseStream(rawStdout) {
  let finalText;
  let firstAction = null;
  const skills = [];
  const skillDirs = [];
  const reads = [];
  let cost;
  let tokens;
  let outputStyle;
  for (const line of rawStdout.split('\n')) {
    if (line.trim() === '') continue;
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    if (event.type === 'assistant') {
      const toolUses = (event.message?.content ?? []).filter((block) => block.type === 'tool_use');
      for (const toolUse of toolUses) {
        if (firstAction === null && ACTIONS.has(toolUse.name)) {
          firstAction = `${toolUse.name} ${toolUse.input?.file_path ?? ''}`.trim();
        }
        if (toolUse.name === 'Read' && toolUse.input?.file_path) reads.push(String(toolUse.input.file_path));
        if (toolUse.name === 'Skill') skills.push(String(toolUse.input?.skill ?? ''));
      }
    }
    skillDirs.push(...loadedSkillDirs(event));
    if (event.type === 'system' && event.subtype === 'init' && typeof event.output_style === 'string') outputStyle = event.output_style;
    if (event.type === 'result') {
      finalText = typeof event.result === 'string' ? event.result : '';
      if (typeof event.total_cost_usd === 'number') cost = event.total_cost_usd;
      tokens = event.modelUsage && typeof event.modelUsage === 'object' ? modelUsageTokens(event.modelUsage) : undefined;
    }
  }
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

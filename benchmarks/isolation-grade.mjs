export const AGENTS = ['review-branch', 'find-open-points'];

export function leakedPlugins(init, named) {
  return (init.plugins ?? []).map((plugin) => plugin.name).filter((name) => !named.includes(name));
}

export function parseEvents(stream) {
  return stream.split('\n').flatMap((line) => {
    try {
      return [JSON.parse(line)];
    } catch {
      return [];
    }
  });
}

const blocks = (event) => (Array.isArray(event.message?.content) ? event.message.content : []);

function textOf(content) {
  return typeof content === 'string' ? content : (content ?? []).map((part) => part.text ?? '').join('\n');
}

export function gradeStream(stream, marker) {
  const events = parseEvents(stream);
  const result = events.find((event) => event.type === 'result');
  if (!result) return { verdict: 'UNRUN', cause: 'no result event' };
  if (result.subtype !== 'success' || result.is_error) return { verdict: 'UNRUN', cause: `result ${result.subtype}` };
  const dispatches = events.filter((event) => event.type === 'assistant').flatMap(blocks)
    .filter((block) => block.type === 'tool_use' && block.name === 'Agent')
    .map((block) => ({ id: block.id, agent: AGENTS.find((agent) => block.input?.subagent_type === `exo:${agent}`), brief: JSON.stringify(block.input), background: Boolean(block.input?.run_in_background) }));
  const leaked = dispatches.find((dispatch) => dispatch.brief.includes(marker));
  if (leaked) return { verdict: 'UNRUN', cause: `marker pasted into the ${leaked.agent ?? 'agent'} brief` };
  const missing = AGENTS.filter((agent) => !dispatches.some((dispatch) => dispatch.agent === agent));
  if (missing.length > 0) return { verdict: 'FAIL', cause: `not dispatched: ${missing.join(', ')}` };
  const returned = events.filter((event) => event.type === 'user').flatMap((event) => blocks(event).filter((block) => block.type === 'tool_result')
    .map((block) => ({ ...block, async: Boolean(event.toolUseResult?.isAsync || event.toolUseResult?.status === 'async_launched') })));
  for (const { id, agent, background } of dispatches.filter((dispatch) => dispatch.agent)) {
    const reply = returned.find((block) => block.tool_use_id === id);
    if (!reply) return { verdict: 'UNRUN', cause: `no result from ${agent}` };
    if (reply.is_error) return { verdict: 'UNRUN', cause: `${agent} errored` };
    if (background || reply.async) return { verdict: 'UNRUN', cause: `${agent} ran in the background` };
    const own = events.filter((event) => event.parent_tool_use_id === id).flatMap(blocks).map((block) => block.text ?? block.thinking ?? '');
    if ([textOf(reply.content), ...own].some((text) => text.includes(marker))) return { verdict: 'FAIL', cause: `${agent} output holds the marker` };
  }
  return { verdict: 'PASS', cause: '' };
}

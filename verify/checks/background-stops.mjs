const BACKGROUND_TOOLS = ['Bash', 'Monitor'];
const BAN = /\b(?:start|use|run|call) no [^.\n]*background/i;

function frontmatterTools(text) {
  const line = /^tools:\s*(.+)$/m.exec(text)?.[1] ?? '';
  return line.split(',').map((tool) => tool.trim());
}

function bodyOf(text) {
  return text.replace(/^---\n[\s\S]*?\n---\n/, '');
}

function leaksBackground(text) {
  const tools = frontmatterTools(text);
  if (!BACKGROUND_TOOLS.some((tool) => tools.includes(tool))) return false;
  const body = bodyOf(text);
  if (tools.includes('TaskStop') && body.includes('TaskStop')) return false;
  return tools.includes('Monitor') || !BAN.test(body);
}

export function checkBackgroundStops(report, repository) {
  const leaking = repository.agentFiles()
    .filter((file) => leaksBackground(repository.text(file)))
    .map((file) => repository.relative(file));
  report.assert(
    leaking.length === 0,
    'background stops',
    'every agent that can start a background shell or Monitor can stop it or may not start one',
    `${leaking.join(', ')} can start a background shell or Monitor and neither holds TaskStop with a TaskStop instruction nor says "start no background ..."`
  );
}

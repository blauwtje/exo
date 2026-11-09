function frontmatterTools(text) {
  const line = /^tools:\s*(.+)$/m.exec(text)?.[1] ?? '';
  return line.split(',').map((tool) => tool.trim());
}

function bodyOf(text) {
  return text.replace(/^---\n[\s\S]*?\n---\n/, '');
}

function leaksBackground(text) {
  const tools = frontmatterTools(text);
  if (!tools.includes('Monitor')) return false;
  const body = bodyOf(text);
  if (tools.includes('TaskStop') && body.includes('TaskStop')) return false;
  return true;
}

export function checkBackgroundStops(report, repository) {
  const leaking = repository.agentFiles()
    .filter((file) => leaksBackground(repository.text(file)))
    .map((file) => repository.relative(file));
  report.assert(
    leaking.length === 0,
    'background stops',
    'every agent that can start a Monitor can stop it',
    `${leaking.join(', ')} can start a Monitor and hold no TaskStop with a TaskStop instruction`
  );
}

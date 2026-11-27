import fs from 'node:fs';
import path from 'node:path';

const FENCE = /^```/m;

function bodyOf(lines) {
  if (lines[0] !== '---') return lines;
  const end = lines.indexOf('---', 1);
  return end === -1 ? [] : lines.slice(end + 1);
}

function firstFilled(lines, from = 0) {
  return lines.findIndex((line, index) => index >= from && line.trim() !== '');
}

function titleProblem(name, body) {
  const title = firstFilled(body);
  return title !== -1 && body[title].startsWith('# ') ? [] : [`${name} does not open with a # title`];
}

function skillProblems(repository, skill) {
  const folder = path.join(repository.skillsRoot, skill);
  const file = path.join(folder, 'SKILL.md');
  if (!fs.existsSync(file)) return [];
  const name = repository.relative(file);
  const body = bodyOf(repository.lines(file));
  const text = body.join('\n');
  const problems = titleProblem(name, body);
  if (problems.length === 0) {
    const opener = firstFilled(body, firstFilled(body) + 1);
    if (opener === -1 || !body[opener].startsWith('**')) problems.push(`${name} does not open its first paragraph with a bold rule`);
  }
  if (!FENCE.test(text)) problems.push(`${name} holds no example in a code block`);
  if (text.includes('BASE.md')) problems.push(`${name} names BASE.md, which the SessionStart hook already loads`);
  for (const reference of repository.walk(path.join(folder, 'references'), (full) => full.endsWith('.md'))) {
    const link = path.relative(folder, reference).split(path.sep).join('/');
    if (!text.includes(`(${link})`)) problems.push(`${repository.relative(reference)} is not linked from ${name}`);
  }
  return problems;
}

function agentProblems(repository, file) {
  const name = repository.relative(file);
  const body = bodyOf(repository.lines(file));
  const problems = titleProblem(name, body);
  if (!FENCE.test(body.join('\n'))) problems.push(`${name} holds no report example in a code block`);
  return problems;
}

function hookProblems(repository) {
  const file = repository.join('hooks', 'hooks.json');
  if (!fs.existsSync(file)) return ['hooks/hooks.json is missing'];
  const entries = JSON.parse(repository.text(file)).hooks?.SessionStart ?? [];
  const commands = entries.flatMap((entry) => entry.hooks ?? []).map((hook) => hook.command ?? '');
  return commands.some((command) => command.includes('BASE.md')) ? [] : ['hooks/hooks.json runs no SessionStart command that prints BASE.md'];
}

export function checkPluginShape(report, repository) {
  const skills = fs.existsSync(repository.skillsRoot)
    ? fs.readdirSync(repository.skillsRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort()
    : [];
  const agents = repository.walk(repository.join('agents'), (full) => full.endsWith('.md'));
  const problems = [
    ...skills.flatMap((skill) => skillProblems(repository, skill)),
    ...agents.flatMap((file) => agentProblems(repository, file)),
    ...hookProblems(repository)
  ];
  report.assert(
    problems.length === 0,
    'plugin shape',
    { pass: 'every skill opens with a title and a bold rule and holds an example, every agent shows a report, and the SessionStart hook prints BASE.md', fail: problems.join('; ') }
  );
}

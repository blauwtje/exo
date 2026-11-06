function scalar(text) {
  const value = text.trim();
  if (value === 'true' || value === 'false') return value === 'true';
  if (/^'.*'$|^".*"$/.test(value)) return value.slice(1, -1);
  if (value.startsWith('[') && value.endsWith(']')) return value.slice(1, -1).split(',').map((item) => scalar(item)).filter((item) => item !== '');
  if (value === '{}') return {};
  return value.replace(/\s+#.*$/, '');
}

function indentOf(line) {
  return line.length - line.trimStart().length;
}

export function parseYaml(text) {
  const lines = text.split('\n');
  let position = 0;
  const skipBlank = () => {
    while (position < lines.length && (lines[position].trim() === '' || lines[position].trim().startsWith('#'))) position += 1;
  };
  const blockScalar = (indent) => {
    const body = [];
    while (position < lines.length && (lines[position].trim() === '' || indentOf(lines[position]) > indent)) body.push(lines[position++].trim() === '' ? '' : lines[position - 1].slice(indent + 2));
    return `${body.join('\n').trimEnd()}\n`;
  };
  const entry = (content, indent, target) => {
    const colon = content.indexOf(': ') >= 0 ? content.indexOf(': ') : content.endsWith(':') ? content.length - 1 : -1;
    const key = content.slice(0, colon);
    const rest = content.slice(colon + 1).trim();
    if (rest === '|' || rest === '>-') target[key] = blockScalar(indent);
    else if (rest !== '') target[key] = scalar(rest);
    else {
      skipBlank();
      const next = position < lines.length ? indentOf(lines[position]) : -1;
      const sequence = lines[position]?.trim().startsWith('- ') && next >= indent;
      target[key] = next > indent || sequence ? block(next) : null;
    }
  };
  const block = (indent) => {
    skipBlank();
    if (lines[position].trim().startsWith('- ')) return sequence(indent);
    const result = {};
    for (skipBlank(); position < lines.length && indentOf(lines[position]) === indent; skipBlank()) entry(lines[position++].trim(), indent, result);
    return result;
  };
  const sequence = (indent) => {
    const result = [];
    for (skipBlank(); position < lines.length && indentOf(lines[position]) === indent && lines[position].trim().startsWith('- '); skipBlank()) {
      const content = lines[position].trim().slice(2);
      lines[position] = `${' '.repeat(indent + 2)}${content}`;
      if (/^[\w-]+:( |$)/.test(content)) result.push(block(indent + 2));
      else result.push(scalar(lines[position++]));
    }
    return result;
  };
  return block(0);
}

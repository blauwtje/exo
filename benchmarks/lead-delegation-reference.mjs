const FILE_LIMIT = 44_000;
const AREAS = ['board', 'column', 'card', 'drawer', 'toolbar', 'badge', 'avatar', 'menu', 'dialog', 'tooltip', 'tab', 'filter', 'swimlane', 'header', 'footer', 'search'];
const STATES = ['default', 'hover', 'focus', 'active', 'disabled', 'selected', 'dragging', 'drop-target'];
const PROPS = ['background', 'border-color', 'color', 'box-shadow', 'padding', 'margin', 'font-size', 'line-height', 'border-radius', 'gap'];
const LEVELS = ['low', 'medium', 'high'];

const pick = (list, index) => list[index % list.length];
const hex = (index) => `#${((index * 2654435761) >>> 8).toString(16).padStart(6, '0').slice(-6)}`;

function fill(lineAt) {
  const lines = [];
  let size = 0;
  for (let index = 0; ; index += 1) {
    const line = lineAt(index);
    if (size + line.length + 1 > FILE_LIMIT) return `${lines.join('\n')}\n`;
    lines.push(line);
    size += line.length + 1;
  }
}

function legacyTheme(index) {
  const area = pick(AREAS, index);
  const state = pick(STATES, Math.floor(index / AREAS.length));
  const prop = pick(PROPS, index * 3);
  const value = prop.includes('color') || prop === 'background' ? hex(index) : `${(index % 24) + 2}px`;
  return `.pipeline-${area}--${state}-v${Math.floor(index / 128)} { ${prop}: ${value}; /* legacy rule ${index}, kept for the old skin */ }`;
}

function tokenCatalogue(index) {
  const area = pick(AREAS, index);
  const prop = pick(PROPS, index * 7);
  return `--${area}-${prop}-${index}: ${index % 3 === 0 ? hex(index) : `${(index % 40) + 1}px`}; | role: ${prop} of ${area}; replaces legacy rule ${index * 2}; contrast ${(4 + (index % 90) / 10).toFixed(1)}:1`;
}

function componentAudit(index) {
  const area = pick(AREAS, index);
  const level = pick(LEVELS, index);
  return `Audit ${index}: the ${area} uses ${pick(PROPS, index)} in ${pick(STATES, index)} state with ${level} visual weight; inconsistent with ${pick(AREAS, index + 5)} by ${(index % 9) + 1}px; priority ${level}; owner column ${(index % 6) + 1}.`;
}

const FILES = [
  ['legacy-theme.css', legacyTheme],
  ['token-catalogue.md', tokenCatalogue],
  ['component-audit.md', componentAudit]
];

export function referenceFiles() {
  return FILES.map(([name, lineAt]) => ({ name, text: fill(lineAt) }));
}

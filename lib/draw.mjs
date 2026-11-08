export function seeded(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function draw(pool, random = Math.random, count = 3) {
  const rest = [...pool];
  const picked = [];
  while (picked.length < count) picked.push(rest.splice(Math.floor(random() * rest.length), 1)[0]);
  return picked;
}

function insertPath(root, path) {
  let node = root;
  for (const part of path.split("/")) {
    node.children[part] ??= { children: {} };
    node = node.children[part];
  }
}

function renderNode(node, depth) {
  const lines = [];
  for (const name of Object.keys(node.children).sort()) {
    lines.push(`${"  ".repeat(depth)}${name}`);
    lines.push(...renderNode(node.children[name], depth + 1));
  }
  return lines;
}

export function changedFileTree(paths) {
  const root = { children: {} };
  for (const path of paths) insertPath(root, path);
  return renderNode(root, 0).join("\n");
}

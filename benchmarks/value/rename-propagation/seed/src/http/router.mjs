export function createRouter() {
  const routes = [];
  return {
    add(method, pattern, handler) {
      const keys = [];
      const source = pattern.replace(/:([a-zA-Z]+)/g, (_, key) => {
        keys.push(key);
        return '([^/]+)';
      });
      routes.push({ method, regex: new RegExp(`^${source}$`), keys, handler });
    },
    match(method, path) {
      for (const route of routes) {
        if (route.method !== method) continue;
        const found = route.regex.exec(path);
        if (!found) continue;
        const params = Object.fromEntries(route.keys.map((key, i) => [key, decodeURIComponent(found[i + 1])]));
        return { handler: route.handler, params };
      }
      return null;
    },
  };
}

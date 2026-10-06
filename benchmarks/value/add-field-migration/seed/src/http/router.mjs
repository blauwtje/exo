export function createRouter(routes) {
  const compiled = routes.map(([method, pattern, handler]) => ({
    method,
    handler,
    matcher: new RegExp(`^${pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)')}/?$`),
  }));
  return function match(method, pathname) {
    for (const route of compiled) {
      if (route.method !== method) continue;
      const found = route.matcher.exec(pathname);
      if (found) return { handler: route.handler, params: { ...found.groups } };
    }
    return null;
  };
}

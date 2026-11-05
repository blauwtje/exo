import fs from 'node:fs';
import path from 'node:path';
import { ECOSYSTEM_MANIFESTS } from '#size-facts';

const ECOSYSTEMS = [
  { manifests: ECOSYSTEM_MANIFESTS.npm, domains: ['registry.npmjs.org'] },
  { manifests: ['yarn.lock'], domains: ['registry.yarnpkg.com'] },
  {
    manifests: ['*.csproj', '*.fsproj', '*.sln'],
    domains: ['api.nuget.org'],
    env: { DOTNET_CLI_TELEMETRY_OPTOUT: '1', DOTNET_NOLOGO: '1', MSBUILDDISABLENODEREUSE: '1', DOTNET_CLI_USE_MSBUILD_SERVER: '0' }
  },
  { manifests: ECOSYSTEM_MANIFESTS.pypi, domains: ['pypi.org', 'files.pythonhosted.org'] },
  { manifests: ECOSYSTEM_MANIFESTS.crates, domains: ['index.crates.io', 'static.crates.io'] },
  { manifests: ECOSYSTEM_MANIFESTS.go, domains: ['proxy.golang.org', 'sum.golang.org'] }
];

const REGISTRY_CONFIGS = [
  { file: '.npmrc', url: /^\s*(?:@[^\s:=]+:)?registry\s*=\s*(\S+)/gm },
  { file: '.yarnrc.yml', url: /^\s*npmRegistryServer\s*:\s*["']?([^"'\s]+)/gm },
  { file: 'nuget.config', url: /<add\b[^>]*\bvalue\s*=\s*"([^"]+)"/gi },
  { file: 'pip.conf', url: /^\s*(?:extra-)?index-url\s*=\s*(\S+)/gm }
];

function matchesManifest(pattern, name) {
  if (pattern.startsWith('*')) return name.endsWith(pattern.slice(1));
  return name === pattern;
}

function webHost(url) {
  if (!URL.canParse(url)) return null;
  const parsed = new URL(url);
  if (!['http:', 'https:'].includes(parsed.protocol)) return null;
  return parsed.hostname;
}

function configuredRegistries(root, entries) {
  return REGISTRY_CONFIGS.flatMap(({ file, url }) => {
    const entry = entries.find((name) => name.toLowerCase() === file);
    if (entry === undefined) return [];
    const text = fs.readFileSync(path.join(root, entry), 'utf8');
    return [...text.matchAll(url)].map((match) => webHost(match[1])).filter((host) => host !== null);
  });
}

export function projectEcosystems({ root, planFiles = [] }) {
  const entries = fs.readdirSync(root);
  const names = [...entries, ...planFiles.map((file) => path.basename(file))];
  const applied = ECOSYSTEMS.filter((ecosystem) => ecosystem.manifests.some((pattern) => names.some((name) => matchesManifest(pattern, name))));
  return {
    domains: [...applied.flatMap((ecosystem) => ecosystem.domains), ...configuredRegistries(root, entries)],
    env: Object.assign({}, ...applied.map((ecosystem) => ecosystem.env ?? {}))
  };
}

// Turn a trait spec into a bounded candidate set drawn from a live font catalog,
// so a typeface is chosen from metadata rather than from memory. The two routes
// know different things and say so: only Google exposes semantic tags and
// popularity, only Fontsource exposes a per-candidate license. A constraint the
// chosen route cannot enforce excludes candidates or restricts the whole run; it
// is never downgraded to a warning. Nothing is written outside the OS temp dir.
//
//   node scripts/font-candidates.mjs --spec <file> [--source auto|google|fontsource] [--limit <1..20>]
//                                    [--catalog <file>] [--cache <file>] [--offline]
//                                    [--history <file>] [--seed <token>]

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { parseFlags, readJsonFlag, UsageError } from './capture.mjs';
import { isOverusedFamily, loadOverusedFonts } from './overused-fonts.mjs';
import { createPrng, seededShuffle } from './seeded.mjs';

const SEED_TOKEN = /^[A-Za-z0-9._-]+$/;
const DELIVERY_MODES = ['package', 'self-hosted', 'remote-css'];
const EMITTABLE_MODES = { google: ['self-hosted', 'remote-css'], fontsource: DELIVERY_MODES };
const CACHE_TTL_HOURS = 24;
const FETCH_TIMEOUT_MS = 10_000;
const GOOGLE_ENDPOINT = 'https://www.googleapis.com/webfonts/v1/webfonts';
const FONTSOURCE_ENDPOINT = 'https://api.fontsource.org/v1/fonts';
const FONTSOURCE_CDN = 'https://cdn.jsdelivr.net/npm/@fontsource';

const DEFAULT_CONSTRAINTS = {
  allowedLicenses: null,
  deliveryModes: DELIVERY_MODES,
  network: true,
  existingOnly: false
};

// --- spec ------------------------------------------------------------------

const isStringArray = (value) => Array.isArray(value) && value.length > 0 && value.every((item) => typeof item === 'string');

function requireRole(role, position) {
  if (typeof role?.role !== 'string' || role.role.length === 0) {
    throw new UsageError(`roles[${position}].role must be a non-empty string`);
  }
  if (!isStringArray(role.searchTerms)) throw new UsageError(`roles[${position}].searchTerms must be a non-empty string array`);
  if (!isStringArray(role.subsets)) throw new UsageError(`roles[${position}].subsets must be a non-empty string array`);
  if (role.requiredWeights !== undefined
    && !(Array.isArray(role.requiredWeights) && role.requiredWeights.every(Number.isFinite))) {
    throw new UsageError(`roles[${position}].requiredWeights must be an array of numbers`);
  }
  if (role.requiredAxes !== undefined && !Array.isArray(role.requiredAxes)) {
    throw new UsageError(`roles[${position}].requiredAxes must be an array`);
  }
}

export function normalizeSpec(spec) {
  if (spec?.schemaVersion !== 1) throw new UsageError('--spec schemaVersion must be 1');
  if (!Array.isArray(spec.roles) || spec.roles.length === 0) throw new UsageError('--spec must list at least one role');
  spec.roles.forEach(requireRole);
  const constraints = { ...DEFAULT_CONSTRAINTS, ...(spec.constraints ?? {}) };
  if (constraints.allowedLicenses !== null && !isStringArray(constraints.allowedLicenses)) {
    throw new UsageError('constraints.allowedLicenses must be null or a non-empty string array');
  }
  if (!isStringArray(constraints.deliveryModes)
    || constraints.deliveryModes.some((mode) => !DELIVERY_MODES.includes(mode))) {
    throw new UsageError(`constraints.deliveryModes must be a non-empty subset of ${DELIVERY_MODES.join(', ')}`);
  }
  return { roles: spec.roles, constraints, loadConvention: spec.loadConvention ?? null };
}

// --- provider --------------------------------------------------------------

export function chooseProvider({ constraints, source = 'auto', googleKeyPresent = false }) {
  if (source === 'google' || source === 'fontsource') {
    return { provider: source, reason: `--source ${source} was requested explicitly` };
  }
  if (constraints.allowedLicenses !== null) {
    return { provider: 'fontsource', reason: 'a license constraint is set and only Fontsource exposes a per-candidate license' };
  }
  if (googleKeyPresent) {
    return { provider: 'google', reason: 'GOOGLE_FONTS_API_KEY is set, so tag semantics and popularity are available' };
  }
  return { provider: 'fontsource', reason: 'no GOOGLE_FONTS_API_KEY is set, so the keyless Fontsource catalog is used' };
}

function constraintPlan(provider, requested) {
  const unmet = [];
  const enforced = { ...requested };
  if (requested.allowedLicenses !== null && provider !== 'fontsource') {
    enforced.allowedLicenses = null;
    unmet.push('allowedLicenses');
  }
  enforced.deliveryModes = requested.deliveryModes.filter((mode) => EMITTABLE_MODES[provider].includes(mode));
  if (enforced.deliveryModes.length === 0) unmet.push('deliveryModes');
  return { enforced, unmet };
}

// --- catalog normalization -------------------------------------------------

const slug = (family) => family.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

function googleVariant(variant) {
  if (variant === 'regular') return { weight: 400, style: 'normal' };
  if (variant === 'italic') return { weight: 400, style: 'italic' };
  const match = /^(\d{3})(italic)?$/.exec(variant);
  if (!match) return null;
  return { weight: Number(match[1]), style: match[2] ? 'italic' : 'normal' };
}

export function normalizeGoogle(items, { popularityOrdered }) {
  return items.map((item, index) => {
    const parsed = (item.variants ?? []).map(googleVariant).filter(Boolean);
    const axes = Object.fromEntries((item.axes ?? []).map((axis) => [axis.tag, { min: axis.start, max: axis.end }]));
    return {
      family: item.family,
      id: slug(item.family),
      category: item.category ?? null,
      subsets: item.subsets ?? [],
      weights: [...new Set(parsed.map((entry) => entry.weight))].sort((a, b) => a - b),
      styles: [...new Set(parsed.map((entry) => entry.style))].sort(),
      variableAxes: axes,
      license: null,
      popularityRank: popularityOrdered ? index + 1 : null,
      tags: item.tags ?? [],
      files: item.files ?? {},
      lastModified: item.lastModified ?? null
    };
  });
}

export function normalizeFontsource(items, axesById = {}) {
  // Fontsource's font list says whether a family is variable but not which axes
  // it carries; those come from the per-family endpoint. Unresolved axes stay
  // null — the absence of knowledge, not the knowledge of an absence.
  return items.map((item) => ({
    family: item.family,
    id: item.id,
    category: item.category ?? null,
    subsets: item.subsets ?? [],
    weights: [...(item.weights ?? [])].sort((a, b) => a - b),
    styles: [...(item.styles ?? [])].sort(),
    variableAxes: axesById[item.id] ?? (item.variable ? null : {}),
    license: item.license ?? null,
    popularityRank: null,
    tags: [],
    files: {},
    defSubset: item.defSubset ?? (item.subsets ?? [])[0] ?? 'latin',
    lastModified: item.lastModified ?? null
  }));
}

export function detectCatalogShape(catalog) {
  if (Array.isArray(catalog)) return 'fontsource';
  if (Array.isArray(catalog?.fonts)) return 'fontsource';
  if (Array.isArray(catalog?.items)) return 'google';
  throw new UsageError('--catalog is neither a Google webfonts response nor a Fontsource font list');
}

// Array position is a popularity rank only in the Google endpoint's own
// `sort=popularity` response, live or cached verbatim. A --catalog file is in
// whatever order its author saved it in, so position there claims nothing.
function normalizeCatalog(catalog, provider, catalogOrigin) {
  if (provider === 'google') return normalizeGoogle(catalog.items, { popularityOrdered: catalogOrigin !== 'file' });
  const items = Array.isArray(catalog) ? catalog : catalog.fonts;
  return normalizeFontsource(items, Array.isArray(catalog) ? {} : (catalog.variable ?? {}));
}

// --- technical filter ------------------------------------------------------

function weightCovered(font, weight) {
  if (font.weights.includes(weight)) return true;
  const range = font.variableAxes?.wght;
  return Boolean(range) && weight >= range.min && weight <= range.max;
}

/** Does this font satisfy the role's hard requirements, and on what evidence? */
export function technicalPass(font, roleSpec) {
  const matchEvidence = [];
  const unknown = [];
  if (roleSpec.category && font.category !== roleSpec.category) return { pass: false, matchEvidence, unknown };
  if (roleSpec.category) matchEvidence.push('category');

  if (!roleSpec.subsets.every((subset) => font.subsets.includes(subset))) {
    return { pass: false, matchEvidence, unknown };
  }
  matchEvidence.push('subsets');

  const weights = roleSpec.requiredWeights ?? [];
  if (!weights.every((weight) => weightCovered(font, weight))) return { pass: false, matchEvidence, unknown };
  if (weights.length > 0) matchEvidence.push('weights');

  if (roleSpec.requireItalic) {
    if (!font.styles.includes('italic')) return { pass: false, matchEvidence, unknown };
    matchEvidence.push('italic');
  }

  for (const axis of roleSpec.requiredAxes ?? []) {
    // A family whose axes could not be resolved is excluded, never assumed to have them.
    if (!font.variableAxes || !(axis in font.variableAxes)) return { pass: false, matchEvidence, unknown };
    matchEvidence.push(`axes:${axis}`);
  }

  if (roleSpec.tabularFigures) unknown.push('tabularFigures');
  return { pass: true, matchEvidence, unknown };
}

// --- load options ----------------------------------------------------------

function googleCssUrl(font, roleSpec) {
  const weights = (roleSpec.requiredWeights ?? []).slice().sort((a, b) => a - b);
  const family = font.family.replace(/ /g, '+');
  return weights.length > 0
    ? `https://fonts.googleapis.com/css2?family=${family}:wght@${weights.join(';')}&display=swap`
    : `https://fonts.googleapis.com/css2?family=${family}&display=swap`;
}

function googleFileUrl(font, roleSpec) {
  const weight = (roleSpec.requiredWeights ?? [])[0] ?? 400;
  return font.files[weight === 400 ? 'regular' : String(weight)] ?? font.files.regular ?? null;
}

function loadOptions(font, roleSpec, provider, enforcedModes) {
  const options = [];
  if (provider === 'google') {
    const fileUrl = googleFileUrl(font, roleSpec);
    if (fileUrl) options.push({ mode: 'self-hosted', source: fileUrl });
    options.push({ mode: 'remote-css', source: googleCssUrl(font, roleSpec) });
  } else {
    const weight = (roleSpec.requiredWeights ?? [])[0] ?? (font.weights.includes(400) ? 400 : font.weights[0]);
    options.push({ mode: 'package', source: `@fontsource/${font.id}` });
    options.push({ mode: 'self-hosted', source: `${FONTSOURCE_CDN}/${font.id}/files/${font.id}-${font.defSubset}-${weight}-normal.woff2` });
    options.push({ mode: 'remote-css', source: `${FONTSOURCE_CDN}/${font.id}/index.css` });
  }
  return options.filter((option) => enforcedModes.includes(option.mode));
}

// --- ranking ---------------------------------------------------------------

const tokensOf = (terms) => new Set(terms.flatMap((term) => term.toLowerCase().split(/[^a-z0-9]+/)).filter(Boolean));

function tagScore(font, roleSpec) {
  const wanted = tokensOf(roleSpec.searchTerms);
  const matches = [];
  let score = 0;
  for (const tag of font.tags) {
    const tagTokens = tokensOf([tag.name ?? '']);
    if ([...tagTokens].some((token) => wanted.has(token))) {
      matches.push(tag.name);
      score += (tag.weight ?? 0) / 100;
    }
  }
  return { score, matches };
}

function weightSpanBucket(weights) {
  if (weights.length === 0) return 'none';
  const span = weights[weights.length - 1] - weights[0];
  if (span === 0) return 'single';
  if (span <= 300) return 'narrow';
  if (span <= 600) return 'wide';
  return 'full';
}

function variableStatus(font) {
  if (font.variableAxes === null) return { status: 'variable-axes-unknown', axes: 'unknown' };
  const axes = Object.keys(font.variableAxes).sort().join('+');
  return { status: axes ? 'variable' : 'static', axes: axes || 'none' };
}

function stratumKey(font) {
  const { status, axes } = variableStatus(font);
  const modified = font.lastModified ? String(font.lastModified).slice(0, 4) : 'unknown';
  return [
    status,
    axes,
    weightSpanBucket(font.weights),
    (font.styles ?? []).length,
    font.category ?? 'unknown',
    modified
  ].join('|');
}

function stratifiedPick(passed, limit, prng) {
  const strata = new Map();
  for (const entry of passed) {
    const key = stratumKey(entry.font);
    if (!strata.has(key)) strata.set(key, []);
    strata.get(key).push(entry);
  }
  const queues = [...strata.keys()].sort().map((key) => seededShuffle(strata.get(key), prng));
  const picked = [];
  let progressed = true;
  while (picked.length < limit && progressed) {
    progressed = false;
    for (const queue of queues) {
      if (picked.length >= limit) break;
      const next = queue.shift();
      if (!next) continue;
      picked.push(next);
      progressed = true;
    }
  }
  return picked;
}

/** Route-specific ordering. The Google route ranks on tag semantics; the
 *  Fontsource route has no semantic metadata and diversifies instead. */
export function rankCandidates(passed, roleSpec, { provider, history, limit, prng }) {
  if (provider === 'google') {
    const scored = passed.map((entry) => {
      const { score, matches } = tagScore(entry.font, roleSpec);
      // An unranked catalog gets no popularity term rather than a fabricated
      // one, leaving tag semantics to carry the ordering alone.
      const popularityPenalty = entry.font.popularityRank === null
        ? 0
        : Math.max(0, 1 - entry.font.popularityRank / 100);
      const historyPenalty = history.includes(entry.font.family) ? 2 : 0;
      return { ...entry, tagMatches: matches, score: score - popularityPenalty - historyPenalty };
    });
    // Code-point order, not localeCompare: ties are common below the popularity
    // cut, and an ICU-locale-dependent tie break makes the same catalog and spec
    // rank differently on two machines.
    scored.sort((a, b) => (b.score - a.score)
      || (a.font.family < b.font.family ? -1 : a.font.family > b.font.family ? 1 : 0));
    return scored.slice(0, limit);
  }
  const withoutHistory = passed.filter((entry) => !history.includes(entry.font.family));
  return stratifiedPick(withoutHistory, limit, prng).map((entry) => ({ ...entry, tagMatches: [] }));
}

// --- report ----------------------------------------------------------------

// overusedExcluded is null until a catalog was actually filtered: a restricted
// or unavailable run excluded nothing, and 0 would claim it did the work.
function envelope({ status, reason, provider, providerSelectionReason, catalogOrigin, requested, enforced, unmet,
  cachePath, cacheAgeHours, roles, overusedExcluded = null }) {
  return {
    status,
    reason: reason ?? null,
    provider,
    providerSelectionReason,
    catalogOrigin,
    rankingMode: provider === 'google' ? 'tag-semantic' : 'stratified-diversified',
    requestedConstraints: requested,
    enforcedConstraints: { ...enforced, overusedExcluded },
    unmetConstraints: unmet,
    cachePath: cachePath ?? null,
    cacheAgeHours: cacheAgeHours ?? null,
    roles
  };
}

const emptyRoles = (spec) => spec.roles.map((role) => ({ role: role.role, candidates: [] }));

function candidateRecord(entry, roleSpec, provider) {
  const { font, matchEvidence, unknown, tagMatches, options } = entry;
  const unknownFields = [...unknown];
  if (provider === 'google') unknownFields.push('license');
  if (font.popularityRank === null) unknownFields.push('popularityRank');
  if (font.variableAxes === null) unknownFields.push('variableAxes');
  const traitMatchConfidence = provider === 'google'
    ? (tagMatches.length > 0 ? 'tag-matched' : 'technical-only')
    : (roleSpec.category ? 'category-only' : 'technical-only');
  return {
    family: font.family,
    id: font.id,
    category: font.category,
    subsets: font.subsets,
    weights: font.weights,
    styles: font.styles,
    variableAxes: font.variableAxes,
    italic: font.styles.includes('italic'),
    license: font.license,
    popularityRank: font.popularityRank,
    tagMatches,
    traitMatchConfidence,
    matchEvidence,
    unknown: unknownFields,
    loadOptions: options
  };
}

export function resolveCandidates({ spec, catalog, provider, providerSelectionReason,
  history = [], limit = 8, seed = 'ui-design', catalogOrigin = 'file', cachePath = null, cacheAgeHours = null,
  overused = loadOverusedFonts(), allowOverused = false }) {
  const { roles, constraints } = spec;
  const { enforced, unmet } = constraintPlan(provider, constraints);
  const base = {
    provider, providerSelectionReason, catalogOrigin,
    requested: constraints, enforced, unmet, cachePath, cacheAgeHours
  };

  if (constraints.existingOnly) {
    return envelope({ ...base, status: 'restricted', reason: 'existing-faces-only', roles: emptyRoles(spec) });
  }
  if (unmet.length > 0) {
    return envelope({
      ...base,
      status: 'restricted',
      reason: `the ${provider} route cannot enforce ${unmet.join(', ')}`,
      roles: emptyRoles(spec)
    });
  }

  const fonts = normalizeCatalog(catalog, provider, catalogOrigin);
  const licensed = constraints.allowedLicenses === null
    ? fonts
    : fonts.filter((font) => constraints.allowedLicenses.includes(font.license));
  // The ban runs before ranking on both routes: a popularity penalty still lets
  // an overused family through, and only --allow-overused lifts it.
  const eligible = allowOverused ? licensed : licensed.filter((font) => !isOverusedFamily(font.family, overused));
  const overusedExcluded = licensed.length - eligible.length;

  const resolved = roles.map((roleSpec) => {
    const passed = [];
    for (const font of eligible) {
      const verdict = technicalPass(font, roleSpec);
      if (!verdict.pass) continue;
      // A candidate offering no enforced delivery mode is excluded, not annotated.
      const options = loadOptions(font, roleSpec, provider, enforced.deliveryModes);
      if (options.length === 0) continue;
      passed.push({ font, matchEvidence: verdict.matchEvidence, unknown: verdict.unknown, options });
    }
    const prng = createPrng(`${seed}:${roleSpec.role}`);
    const ranked = rankCandidates(passed, roleSpec, { provider, history, limit, prng });
    return { role: roleSpec.role, candidates: ranked.map((entry) => candidateRecord(entry, roleSpec, provider)) };
  });

  return envelope({ ...base, status: 'ok', reason: null, overusedExcluded, roles: resolved });
}

// --- catalog IO ------------------------------------------------------------

function defaultCachePath(provider) {
  return path.join(os.tmpdir(), `ui-design-font-catalog-${provider}.json`);
}

function requireTemporaryPath(candidate) {
  const resolved = path.resolve(candidate);
  const root = path.resolve(os.tmpdir());
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new UsageError(`--cache must resolve inside ${root}, received '${resolved}'`);
  }
  return resolved;
}

async function readCache(file) {
  try {
    const [text, stats] = await Promise.all([fs.readFile(file, 'utf8'), fs.stat(file)]);
    return { catalog: JSON.parse(text), ageHours: (Date.now() - stats.mtimeMs) / 3_600_000 };
  } catch {
    return null;
  }
}

async function fetchCatalog(provider) {
  const key = process.env.GOOGLE_FONTS_API_KEY;
  if (provider === 'google' && !key) return { error: 'no-google-fonts-api-key' };
  const url = provider === 'google'
    ? `${GOOGLE_ENDPOINT}?key=${encodeURIComponent(key)}&sort=popularity&capability=VF&capability=FAMILY_TAGS`
    : FONTSOURCE_ENDPOINT;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!response.ok) return { error: `http-${response.status}` };
    return { catalog: await response.json() };
  } catch (error) {
    return { error: error.name === 'TimeoutError' || error.name === 'AbortError' ? 'timeout' : 'network-error' };
  }
}

async function resolveCatalog({ provider, pinnedCatalog, cacheFile, offline }) {
  if (pinnedCatalog) return { catalog: pinnedCatalog, origin: 'file', cachePath: null, ageHours: null };

  const cachePath = cacheFile ?? defaultCachePath(provider);
  const cached = await readCache(cachePath);
  if (cached && (offline || cached.ageHours <= CACHE_TTL_HOURS)) {
    return { catalog: cached.catalog, origin: 'cache', cachePath, ageHours: Number(cached.ageHours.toFixed(3)) };
  }
  if (offline) return { error: 'offline-no-cache', cachePath };

  const fetched = await fetchCatalog(provider);
  if (fetched.error) return { error: fetched.error, cachePath };
  await fs.writeFile(cachePath, JSON.stringify(fetched.catalog)).catch(() => {});
  return { catalog: fetched.catalog, origin: 'network', cachePath, ageHours: 0 };
}

// --- CLI -------------------------------------------------------------------

function requireLimit(text) {
  if (text === undefined) return 8;
  const limit = Number(text);
  if (!Number.isInteger(limit) || limit < 1 || limit > 20) {
    throw new UsageError(`--limit must be an integer from 1 to 20, received '${text}'`);
  }
  return limit;
}

async function main(argv) {
  const flags = parseFlags(argv, {
    spec: 'value', source: 'value', limit: 'value', catalog: 'value',
    cache: 'value', offline: 'boolean', history: 'value', seed: 'value', 'allow-overused': 'boolean'
  });
  if (!flags.spec) throw new UsageError('--spec is required');
  const source = flags.source ?? 'auto';
  if (!['auto', 'google', 'fontsource'].includes(source)) {
    throw new UsageError(`--source must be auto, google or fontsource, received '${source}'`);
  }
  const seed = flags.seed ?? 'ui-design';
  if (!SEED_TOKEN.test(seed)) throw new UsageError('--seed must be a plain file-name token');
  // Validated before any catalog work, so a cache path outside the OS temp
  // directory is refused even when --catalog would have skipped the cache.
  const cacheFile = flags.cache ? requireTemporaryPath(flags.cache) : null;
  const limit = requireLimit(flags.limit);
  const spec = normalizeSpec(await readJsonFlag(flags.spec, '--spec'));
  const history = flags.history ? await readJsonFlag(flags.history, '--history') : [];
  if (!Array.isArray(history)) throw new UsageError('--history must be a JSON array of family names');

  const googleKeyPresent = Boolean(process.env.GOOGLE_FONTS_API_KEY);
  let { provider, reason } = chooseProvider({ constraints: spec.constraints, source, googleKeyPresent });
  const offline = Boolean(flags.offline) || spec.constraints.network === false;

  if (spec.constraints.existingOnly) {
    const { enforced, unmet } = constraintPlan(provider, spec.constraints);
    return envelope({
      status: 'restricted', reason: 'existing-faces-only', provider, providerSelectionReason: reason,
      catalogOrigin: null, requested: spec.constraints, enforced, unmet,
      cachePath: null, cacheAgeHours: null, roles: emptyRoles(spec)
    });
  }

  let pinnedCatalog = null;
  if (flags.catalog) {
    pinnedCatalog = await readJsonFlag(flags.catalog, '--catalog');
    const shape = detectCatalogShape(pinnedCatalog);
    if (source !== 'auto' && shape !== source) {
      throw new UsageError(`--catalog holds a ${shape} catalog, which contradicts --source ${source}`);
    }
    if (source === 'auto') {
      provider = shape;
      reason = `--catalog holds a ${shape} catalog`;
    }
  }

  const resolved = await resolveCatalog({ provider, pinnedCatalog, cacheFile, offline });
  if (resolved.error) {
    const { enforced, unmet } = constraintPlan(provider, spec.constraints);
    return envelope({
      status: 'unavailable', reason: resolved.error, provider, providerSelectionReason: reason,
      catalogOrigin: null, requested: spec.constraints, enforced, unmet,
      cachePath: resolved.cachePath ?? null, cacheAgeHours: null, roles: emptyRoles(spec)
    });
  }

  return resolveCandidates({
    spec, catalog: resolved.catalog, provider, providerSelectionReason: reason,
    history, limit, seed, catalogOrigin: resolved.origin,
    cachePath: resolved.cachePath, cacheAgeHours: resolved.ageHours,
    allowOverused: Boolean(flags['allow-overused'])
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  main(process.argv.slice(2)).then((report) => {
    process.stdout.write(`${JSON.stringify(report)}\n`);
  }).catch((error) => {
    if (error instanceof UsageError) {
      process.stderr.write(`ui-design: ${error.message}\n`);
      process.exitCode = 2;
      return;
    }
    process.stderr.write(`ui-design: ${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  });
}

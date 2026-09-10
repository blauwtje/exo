// Behavioral tests for font-candidates.mjs. Fully offline: every run is pinned
// to a fixture catalog, so no test depends on a live font API or a network path.

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { chooseProvider } from '../skills/designing/scripts/font-candidates.mjs';
import { fixture, jsonFixture, run, script } from './harness.mjs';

const FONTS = script('font-candidates.mjs');

/** A Google webfonts response: tags and axes, no license anywhere. */
function googleCatalog() {
  return {
    kind: 'webfonts#webfontList',
    items: [
      {
        family: 'Familiar Sans', category: 'sans-serif', subsets: ['latin', 'latin-ext'],
        variants: ['regular', '700', 'italic'], lastModified: '2024-03-01',
        files: { regular: 'https://fonts.gstatic.com/s/familiar/regular.ttf', 700: 'https://fonts.gstatic.com/s/familiar/700.ttf' },
        tags: [{ name: 'neutral', weight: 90 }]
      },
      {
        family: 'Tidal Serif', category: 'serif', subsets: ['latin', 'latin-ext'],
        variants: ['regular', '700', 'italic'], lastModified: '2023-11-02',
        files: { regular: 'https://fonts.gstatic.com/s/tidal/regular.ttf', 700: 'https://fonts.gstatic.com/s/tidal/700.ttf' },
        axes: [{ tag: 'opsz', start: 8, end: 144 }, { tag: 'wght', start: 100, end: 900 }],
        tags: [{ name: 'maritime', weight: 80 }, { name: 'editorial', weight: 60 }]
      },
      {
        // No file URLs at all, so this family cannot be self-hosted from this metadata.
        family: 'Harbor Display', category: 'serif', subsets: ['latin', 'latin-ext'],
        variants: ['regular', '700'], lastModified: '2022-06-11',
        files: {},
        tags: [{ name: 'maritime', weight: 95 }]
      },
      {
        family: 'Narrow Latin', category: 'serif', subsets: ['latin', 'latin-ext'],
        variants: ['regular', '700'], lastModified: '2021-01-01',
        files: { regular: 'https://fonts.gstatic.com/s/narrow/regular.ttf', 700: 'https://fonts.gstatic.com/s/narrow/700.ttf' },
        tags: []
      }
    ]
  };
}

/** A Fontsource font list: licenses and weights, no tags and no popularity. */
function fontsourceCatalog() {
  return {
    fonts: [
      {
        id: 'harbor-serif', family: 'Harbor Serif', category: 'serif', subsets: ['latin', 'latin-ext'],
        weights: [400, 700], styles: ['normal', 'italic'], defSubset: 'latin', variable: true,
        license: 'OFL-1.1', lastModified: '2024-02-02', type: 'google'
      },
      {
        id: 'tidal-variable', family: 'Tidal Variable', category: 'serif', subsets: ['latin', 'latin-ext'],
        weights: [100, 900], styles: ['normal', 'italic'], defSubset: 'latin', variable: true,
        license: 'OFL-1.1', lastModified: '2024-05-05', type: 'google'
      },
      {
        id: 'static-old-serif', family: 'Static Old Serif', category: 'serif', subsets: ['latin', 'latin-ext'],
        weights: [400, 700], styles: ['normal', 'italic'], defSubset: 'latin', variable: false,
        license: 'OFL-1.1', lastModified: '2019-09-09', type: 'other'
      },
      {
        id: 'static-new-serif', family: 'Static New Serif', category: 'serif', subsets: ['latin', 'latin-ext'],
        weights: [400, 700], styles: ['normal', 'italic'], defSubset: 'latin', variable: false,
        license: 'OFL-1.1', lastModified: '2019-11-11', type: 'other'
      },
      {
        id: 'proprietary-serif', family: 'Proprietary Serif', category: 'serif', subsets: ['latin', 'latin-ext'],
        weights: [400, 700], styles: ['normal'], defSubset: 'latin', variable: false,
        license: 'LicenseRef-Commercial', lastModified: '2024-01-01', type: 'other'
      },
      {
        id: 'latin-only-serif', family: 'Latin Only Serif', category: 'serif', subsets: ['latin'],
        weights: [400], styles: ['normal'], defSubset: 'latin', variable: false,
        license: 'OFL-1.1', lastModified: '2020-01-01', type: 'other'
      }
    ],
    variable: {
      'harbor-serif': { opsz: { min: 8, max: 144 }, wght: { min: 100, max: 900 } },
      'tidal-variable': { wght: { min: 100, max: 900 } }
    }
  };
}

function spec(overrides = {}) {
  return {
    schemaVersion: 1,
    roles: [{
      role: 'display',
      searchTerms: ['maritime', 'tidal', 'instrument'],
      category: 'serif',
      subsets: ['latin', 'latin-ext'],
      requiredWeights: [400, 700],
      requireItalic: false,
      tabularFigures: false,
      ...(overrides.role ?? {})
    }],
    constraints: { ...(overrides.constraints ?? {}) },
    loadConvention: 'npm'
  };
}

async function resolve(args, specValue = spec(), options = {}) {
  const specFile = await jsonFixture('spec.json', specValue);
  const result = await run(FONTS, ['--spec', specFile, ...args], options);
  assert.equal(result.code, 0, result.stderr);
  return JSON.parse(result.stdout);
}

async function catalogFile(name, value) {
  return jsonFixture(name, value);
}

const families = (report, role = 'display') =>
  report.roles.find((entry) => entry.role === role).candidates.map((candidate) => candidate.family);

describe('font-candidates.mjs route honesty', () => {
  it('labels the Google route as tag-semantic and admits it knows no license', async () => {
    const report = await resolve(['--catalog', await catalogFile('google.json', googleCatalog())]);
    assert.equal(report.status, 'ok');
    assert.equal(report.provider, 'google');
    assert.equal(report.rankingMode, 'tag-semantic');
    assert.equal(report.catalogOrigin, 'file');
    assert.ok(report.providerSelectionReason.length > 0);
    for (const candidate of report.roles[0].candidates) {
      assert.equal(candidate.license, null);
      assert.ok(candidate.unknown.includes('license'));
      assert.equal(candidate.popularityRank, null, 'a --catalog file is in no guaranteed order');
      assert.ok(candidate.unknown.includes('popularityRank'));
    }
    const matched = report.roles[0].candidates.find((candidate) => candidate.family === 'Tidal Serif');
    assert.deepEqual(matched.tagMatches, ['maritime'], 'only tags sharing a search term match');
    assert.equal(matched.traitMatchConfidence, 'tag-matched');
    const unmatched = report.roles[0].candidates.find((candidate) => candidate.family === 'Narrow Latin');
    assert.equal(unmatched.traitMatchConfidence, 'technical-only');
  });

  // Only the endpoint's own sort=popularity response ranks by position, so the
  // rank is real for a cached catalog and absent for a hand-supplied one.
  it('ranks by position only for a catalog that came from the ranked endpoint', async () => {
    const specFile = await jsonFixture('spec.json', spec());
    const cache = path.join(await fixture(), 'google-cache.json');
    await fs.writeFile(cache, JSON.stringify(googleCatalog()));

    const result = await run(FONTS, ['--spec', specFile, '--offline', '--cache', cache, '--source', 'google']);
    assert.equal(result.code, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.catalogOrigin, 'cache');
    for (const candidate of report.roles[0].candidates) {
      assert.equal(typeof candidate.popularityRank, 'number');
      assert.ok(!candidate.unknown.includes('popularityRank'));
    }
  });

  it('never claims a trait match on the Fontsource route', async () => {
    const report = await resolve(['--catalog', await catalogFile('fontsource.json', fontsourceCatalog())]);
    assert.equal(report.provider, 'fontsource');
    assert.equal(report.rankingMode, 'stratified-diversified');
    for (const candidate of report.roles[0].candidates) {
      assert.equal(candidate.popularityRank, null);
      assert.ok(candidate.unknown.includes('popularityRank'));
      assert.deepEqual(candidate.tagMatches, []);
      assert.ok(['category-only', 'technical-only'].includes(candidate.traitMatchConfidence));
      assert.ok(candidate.license.length > 0);
    }
  });

  it('echoes requested, enforced and unmet constraints on every response', async () => {
    const report = await resolve(['--catalog', await catalogFile('fontsource.json', fontsourceCatalog())]);
    for (const key of ['requestedConstraints', 'enforcedConstraints', 'unmetConstraints', 'cachePath', 'cacheAgeHours']) {
      assert.ok(key in report, key);
    }
    assert.deepEqual(report.unmetConstraints, []);
    assert.deepEqual(report.requestedConstraints.deliveryModes, ['package', 'self-hosted', 'remote-css']);
  });

  it('names exactly the fields that matched the role spec', async () => {
    const report = await resolve(
      ['--catalog', await catalogFile('fontsource.json', fontsourceCatalog())],
      spec({ role: { requiredAxes: ['wght'], requireItalic: true } })
    );
    for (const candidate of report.roles[0].candidates) {
      assert.deepEqual(candidate.matchEvidence, ['category', 'subsets', 'weights', 'italic', 'axes:wght']);
    }
    assert.deepEqual(families(report).sort(), ['Harbor Serif', 'Tidal Variable']);
  });
});

describe('font-candidates.mjs filtering', () => {
  it('excludes a family missing a required subset', async () => {
    const report = await resolve(['--catalog', await catalogFile('fontsource.json', fontsourceCatalog())]);
    assert.ok(!families(report).includes('Latin Only Serif'));
  });

  it('satisfies required weights from an explicit weight or a wght axis range', async () => {
    const report = await resolve(
      ['--catalog', await catalogFile('fontsource.json', fontsourceCatalog())],
      spec({ role: { requiredWeights: [300, 600] } })
    );
    // Only the two variable families cover 300 and 600 through their wght range.
    assert.deepEqual(families(report).sort(), ['Harbor Serif', 'Tidal Variable']);
  });

  it('excludes a family without the required axis or italic', async () => {
    const axisReport = await resolve(
      ['--catalog', await catalogFile('fontsource.json', fontsourceCatalog())],
      spec({ role: { requiredAxes: ['opsz'] } })
    );
    assert.deepEqual(families(axisReport), ['Harbor Serif']);

    const italicReport = await resolve(
      ['--catalog', await catalogFile('google.json', googleCatalog())],
      spec({ role: { requireItalic: true } })
    );
    assert.ok(!families(italicReport).includes('Harbor Display'));
  });

  it('filters nothing for tabularFigures but records it as unknown', async () => {
    const plain = await resolve(['--catalog', await catalogFile('fontsource.json', fontsourceCatalog())]);
    const tabular = await resolve(
      ['--catalog', await catalogFile('fontsource.json', fontsourceCatalog())],
      spec({ role: { tabularFigures: true } })
    );
    assert.deepEqual(families(tabular).sort(), families(plain).sort());
    for (const candidate of tabular.roles[0].candidates) {
      assert.ok(candidate.unknown.includes('tabularFigures'));
    }
  });

  // Both added families are serif so only the ban, never the technical filter,
  // can remove them; "Roboto Slab" proves the superfamily prefix rule.
  function overusedCatalog() {
    const catalog = fontsourceCatalog();
    const shape = { category: 'serif', subsets: ['latin', 'latin-ext'], weights: [400, 700], styles: ['normal', 'italic'],
      defSubset: 'latin', variable: false, license: 'OFL-1.1', lastModified: '2024-01-01', type: 'google' };
    catalog.fonts.push({ ...shape, id: 'inter', family: 'Inter' }, { ...shape, id: 'roboto-slab', family: 'Roboto Slab' });
    return catalog;
  }

  it('excludes an overused family and its superfamily before ranking and counts them', async () => {
    const report = await resolve(['--catalog', await catalogFile('overused.json', overusedCatalog()), '--limit', '20']);
    assert.equal(report.status, 'ok');
    assert.ok(!families(report).includes('Inter'));
    assert.ok(!families(report).includes('Roboto Slab'));
    assert.equal(report.enforcedConstraints.overusedExcluded, 2);
  });

  it('keeps overused families under --allow-overused and reports zero excluded', async () => {
    const report = await resolve(
      ['--catalog', await catalogFile('overused.json', overusedCatalog()), '--limit', '20', '--allow-overused']);
    assert.ok(families(report).includes('Inter'));
    assert.ok(families(report).includes('Roboto Slab'));
    assert.equal(report.enforcedConstraints.overusedExcluded, 0);
  });
});

describe('font-candidates.mjs constraints are fail-closed', () => {
  it('drops a family whose license is outside allowedLicenses', async () => {
    const report = await resolve(
      ['--catalog', await catalogFile('fontsource.json', fontsourceCatalog())],
      spec({ constraints: { allowedLicenses: ['OFL-1.1'] } })
    );
    assert.equal(report.status, 'ok');
    assert.ok(!families(report).includes('Proprietary Serif'));
  });

  it('restricts an explicit Google run rather than marking license-unknown candidates eligible', async () => {
    const report = await resolve(
      ['--catalog', await catalogFile('google.json', googleCatalog()), '--source', 'google'],
      spec({ constraints: { allowedLicenses: ['OFL-1.1'] } })
    );
    assert.equal(report.status, 'restricted');
    assert.deepEqual(report.unmetConstraints, ['allowedLicenses']);
    assert.deepEqual(report.roles.flatMap((entry) => entry.candidates), []);
  });

  it('emits only requested delivery modes and excludes candidates offering none', async () => {
    const packageOnly = await resolve(
      ['--catalog', await catalogFile('fontsource.json', fontsourceCatalog())],
      spec({ constraints: { deliveryModes: ['package'] } })
    );
    for (const candidate of packageOnly.roles[0].candidates) {
      assert.deepEqual(candidate.loadOptions.map((option) => option.mode), ['package']);
    }

    const selfHostedOnly = await resolve(
      ['--catalog', await catalogFile('google.json', googleCatalog())],
      spec({ constraints: { deliveryModes: ['self-hosted'] } })
    );
    // Harbor Display ships no file URL, so it cannot be self-hosted from this metadata.
    assert.ok(!families(selfHostedOnly).includes('Harbor Display'));
    assert.ok(families(selfHostedOnly).includes('Tidal Serif'));
  });

  it('restricts the run when the provider can emit no requested delivery mode', async () => {
    const report = await resolve(
      ['--catalog', await catalogFile('google.json', googleCatalog())],
      spec({ constraints: { deliveryModes: ['package'] } })
    );
    assert.equal(report.status, 'restricted');
    assert.deepEqual(report.unmetConstraints, ['deliveryModes']);
    assert.deepEqual(report.roles.flatMap((entry) => entry.candidates), []);
  });

  it('uses the canonical load vocabulary and no provider-specific key', async () => {
    for (const catalog of [googleCatalog(), fontsourceCatalog()]) {
      const report = await resolve(['--catalog', await catalogFile('catalog.json', catalog)]);
      for (const candidate of report.roles[0].candidates) {
        for (const option of candidate.loadOptions) {
          assert.deepEqual(Object.keys(option).sort(), ['mode', 'source']);
          assert.ok(['package', 'self-hosted', 'remote-css'].includes(option.mode), option.mode);
        }
      }
      assert.ok(!/"(npm|css)":/.test(JSON.stringify(report)));
    }
  });

  it('short-circuits existingOnly without touching a catalog', async () => {
    const report = await resolve([], spec({ constraints: { existingOnly: true } }));
    assert.equal(report.status, 'restricted');
    assert.equal(report.reason, 'existing-faces-only');
    assert.deepEqual(report.roles.flatMap((entry) => entry.candidates), []);
  });
});

describe('font-candidates.mjs ranking', () => {
  it('penalizes a history family on the Google route and excludes it on Fontsource', async () => {
    const history = await jsonFixture('history.json', ['Tidal Serif', 'Tidal Variable']);

    const google = await resolve(['--catalog', await catalogFile('google.json', googleCatalog())]);
    const googleWithHistory = await resolve(
      ['--catalog', await catalogFile('google.json', googleCatalog()), '--history', history]);
    assert.notEqual(families(google).at(-1), 'Tidal Serif', 'tag-matched family outranks an unmatched one');
    assert.equal(families(googleWithHistory).at(-1), 'Tidal Serif', 'the history penalty pushes it below both');

    const fontsource = await resolve(
      ['--catalog', await catalogFile('fontsource.json', fontsourceCatalog()), '--history', history]);
    assert.ok(!families(fontsource).includes('Tidal Variable'));
  });

  it('stratifies the Fontsource route across variable and static families', async () => {
    const catalog = await catalogFile('fontsource.json', fontsourceCatalog());
    const picked = await resolve([
      '--catalog', catalog, '--limit', '2', '--seed', 'atlas'
    ], spec({ constraints: { allowedLicenses: ['OFL-1.1'] } }));
    const variableFamilies = ['Harbor Serif', 'Tidal Variable'];
    const chosen = families(picked);
    assert.equal(chosen.length, 2);
    assert.equal(chosen.filter((family) => variableFamilies.includes(family)).length, 1,
      `expected one variable and one static family, got ${chosen.join(', ')}`);
  });

  it('changes within-stratum picks with the seed, deterministically', async () => {
    const catalog = await catalogFile('fontsource.json', fontsourceCatalog());
    const forSeed = (seed) => resolve(['--catalog', catalog, '--limit', '2', '--seed', seed],
      spec({ constraints: { allowedLicenses: ['OFL-1.1'] } }));
    const atlas = families(await forSeed('atlas'));
    const atlasAgain = families(await forSeed('atlas'));
    const harbor = families(await forSeed('harbor'));
    assert.deepEqual(atlas, atlasAgain);
    assert.notDeepEqual(atlas, harbor);
  });

  it('respects --limit and defaults to eight', async () => {
    const catalog = await catalogFile('fontsource.json', fontsourceCatalog());
    const limited = await resolve(['--catalog', catalog, '--limit', '1']);
    assert.equal(limited.roles[0].candidates.length, 1);
    const defaulted = await resolve(['--catalog', catalog]);
    assert.ok(defaulted.roles[0].candidates.length <= 8);
  });

  // Ties are the common case below the popularity cut, so the tie break decides
  // the chosen family. localeCompare would resolve it from the process ICU locale.
  it('breaks score ties by code point, not by the process locale', async () => {
    const catalog = fontsourceCatalog();
    const tied = catalog.fonts.find((font) => font.id === 'static-old-serif');
    catalog.fonts.push(
      { ...tied, id: 'angstrom-serif', family: 'Angstrom Serif' },
      { ...tied, id: 'aangstrom-serif', family: 'Ångström Serif' },
      { ...tied, id: 'zeta-serif', family: 'Zeta Serif' }
    );
    const catalogPath = await catalogFile('tied.json', catalog);
    const swedish = await resolve(['--catalog', catalogPath], spec(), { env: { LC_ALL: 'sv_SE.UTF-8', LANG: 'sv_SE.UTF-8' } });
    const american = await resolve(['--catalog', catalogPath], spec(), { env: { LC_ALL: 'en_US.UTF-8', LANG: 'en_US.UTF-8' } });
    assert.deepEqual(families(swedish), families(american));
  });

  it('is byte-identical for the same catalog, spec, history, seed and limit', async () => {
    const specFile = await jsonFixture('spec.json', spec());
    const catalog = await catalogFile('fontsource.json', fontsourceCatalog());
    const history = await jsonFixture('history.json', ['Static Old Serif']);
    const args = ['--spec', specFile, '--catalog', catalog, '--history', history, '--seed', 'atlas'];
    const first = await run(FONTS, args);
    const second = await run(FONTS, args);
    assert.equal(first.code, 0, first.stderr);
    assert.equal(first.stdout, second.stdout);
  });
});

describe('font-candidates.mjs provider choice', () => {
  it('prefers the route that can enforce the requested constraints', () => {
    const licensed = { ...spec({ constraints: { allowedLicenses: ['OFL-1.1'] } }).constraints, deliveryModes: ['package'] };
    const unlicensed = { allowedLicenses: null, deliveryModes: ['remote-css'], network: true, existingOnly: false };

    const withLicense = chooseProvider({ constraints: licensed, source: 'auto', googleKeyPresent: true });
    assert.equal(withLicense.provider, 'fontsource');
    assert.match(withLicense.reason, /license/);

    assert.equal(chooseProvider({ constraints: unlicensed, source: 'auto', googleKeyPresent: true }).provider, 'google');
    assert.equal(chooseProvider({ constraints: unlicensed, source: 'auto', googleKeyPresent: false }).provider, 'fontsource');
    assert.equal(chooseProvider({ constraints: licensed, source: 'google', googleKeyPresent: false }).provider, 'google');
  });
});

describe('font-candidates.mjs catalog resolution', () => {
  it('reports offline-no-cache immediately, without a network attempt', async () => {
    const specFile = await jsonFixture('spec.json', spec());
    const cache = path.join(await fixture(), 'missing-cache.json');
    const started = Date.now();
    const result = await run(FONTS, ['--spec', specFile, '--offline', '--cache', cache, '--source', 'fontsource']);
    assert.equal(result.code, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.status, 'unavailable');
    assert.equal(report.reason, 'offline-no-cache');
    assert.ok(Date.now() - started < 2000, `took ${Date.now() - started}ms`);
  });

  it('treats constraints.network false exactly like --offline', async () => {
    const specFile = await jsonFixture('spec.json', spec({ constraints: { network: false } }));
    const cache = path.join(await fixture(), 'missing-cache.json');
    const result = await run(FONTS, ['--spec', specFile, '--cache', cache, '--source', 'fontsource']);
    assert.equal(result.code, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).reason, 'offline-no-cache');
  });

  it('uses a cache, reports its age, and ignores a corrupt one', async () => {
    const specFile = await jsonFixture('spec.json', spec());
    const directory = await fixture();
    const cache = path.join(directory, 'catalog-cache.json');
    await fs.writeFile(cache, JSON.stringify(fontsourceCatalog()));

    const fresh = await run(FONTS, ['--spec', specFile, '--offline', '--cache', cache, '--source', 'fontsource']);
    const freshReport = JSON.parse(fresh.stdout);
    assert.equal(freshReport.status, 'ok');
    assert.equal(freshReport.catalogOrigin, 'cache');
    assert.equal(freshReport.cachePath, cache);
    assert.ok(freshReport.cacheAgeHours >= 0);

    const stale = new Date(Date.now() - 40 * 3_600_000);
    await fs.utimes(cache, stale, stale);
    const staleRun = await run(FONTS, ['--spec', specFile, '--offline', '--cache', cache, '--source', 'fontsource']);
    const staleReport = JSON.parse(staleRun.stdout);
    assert.equal(staleReport.catalogOrigin, 'cache');
    assert.ok(staleReport.cacheAgeHours > 24, `age ${staleReport.cacheAgeHours}`);

    await fs.writeFile(cache, 'not json at all');
    const corrupt = await run(FONTS, ['--spec', specFile, '--offline', '--cache', cache, '--source', 'fontsource']);
    assert.equal(JSON.parse(corrupt.stdout).reason, 'offline-no-cache');
  });

  it('refuses a cache path outside the OS temp directory', async () => {
    const specFile = await jsonFixture('spec.json', spec());
    const outside = path.join(process.cwd(), 'font-catalog-cache.json');
    const result = await run(FONTS, ['--spec', specFile, '--offline', '--cache', outside]);
    assert.equal(result.code, 2, result.stderr);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /must resolve inside/);
    assert.equal(await fs.access(outside).then(() => true, () => false), false);
    assert.ok(path.resolve(os.tmpdir()).length > 0);
  });
});

describe('font-candidates.mjs usage contract', () => {
  it('exits 2 without stdout for every usage error', async () => {
    const specFile = await jsonFixture('spec.json', spec());
    const googleFile = await catalogFile('google.json', googleCatalog());
    const brokenSpec = await jsonFixture('broken.json', { schemaVersion: 2, roles: [] });
    const noRoles = await jsonFixture('no-roles.json', { schemaVersion: 1, roles: [] });
    const badRole = await jsonFixture('bad-role.json',
      { schemaVersion: 1, roles: [{ role: 'display', subsets: ['latin'] }] });
    const badModes = await jsonFixture('bad-modes.json',
      { schemaVersion: 1, roles: [{ role: 'display', searchTerms: ['a'], subsets: ['latin'] }], constraints: { deliveryModes: ['cdn'] } });

    const invalid = [
      [],
      ['--spec', '/nonexistent/spec.json'],
      ['--spec', brokenSpec],
      ['--spec', noRoles],
      ['--spec', badRole],
      ['--spec', badModes],
      ['--spec', specFile, '--source', 'typekit'],
      ['--spec', specFile, '--source', 'fontsource', '--catalog', googleFile],
      ['--spec', specFile, '--limit', '25'],
      ['--spec', specFile, '--limit', '0'],
      ['--spec', specFile, '--seed', 'not a token'],
      ['--spec', specFile, '--catalog', googleFile, '--nope']
    ];
    for (const args of invalid) {
      const result = await run(FONTS, args);
      assert.equal(result.code, 2, `${args.join(' ')} → ${result.stderr}`);
      assert.equal(result.stdout, '');
      assert.ok(result.stderr.length > 0);
    }
  });

  it('exits 2 on a catalog that is neither provider shape', async () => {
    const specFile = await jsonFixture('spec.json', spec());
    const nonsense = await jsonFixture('nonsense.json', { families: ['a'] });
    const result = await run(FONTS, ['--spec', specFile, '--catalog', nonsense]);
    assert.equal(result.code, 2);
    assert.equal(result.stdout, '');
  });
});

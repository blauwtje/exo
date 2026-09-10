// Behavioral tests for direction.mjs: seeded planning inside a project's axis
// space, contract validation, and the frozen selection. No dependency beyond node:*.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { axisDistance, checkContracts, planDirections, selectContract, VOCABULARY }
  from '../skills/designing/scripts/direction.mjs';
import { jsonFixture, run, script } from './harness.mjs';

const DIRECTION = script('direction.mjs');

const clone = (value) => JSON.parse(JSON.stringify(value));

function space() {
  return {
    schemaVersion: 1,
    axes: {
      composition: {
        values: [
          { id: 'upper-left-high', value: { focalX: 0.2, focalY: 0.2, asymmetry: 'high' }, evidence: 'E5' },
          { id: 'centered-calm', value: { focalX: 0.5, focalY: 0.5, asymmetry: 'low' }, evidence: 'E5' }
        ]
      },
      ground: {
        values: [
          { id: 'light-field', value: { mechanism: 'light-field' }, evidence: 'E1' },
          { id: 'tide-band-strata', value: { mechanism: 'tide-band-strata' }, evidence: 'E3' }
        ]
      },
      colorTopology: {
        values: [
          { id: 'regional-committed', value: { topology: 'regional', commitment: 'committed' }, evidence: 'E2' },
          { id: 'single-restrained', value: { topology: 'single-ramp', commitment: 'restrained' }, evidence: 'E2' }
        ]
      },
      type: {
        values: [
          { id: 'contrast-construction', value: { strategy: 'contrast-construction' }, evidence: 'E2' },
          { id: 'superfamily', value: { strategy: 'superfamily' }, evidence: 'E2' }
        ]
      },
      material: {
        values: [
          { id: 'soft-ambient', value: { grammar: 'soft-ambient' }, evidence: 'E1' },
          { id: 'hard-offset', value: { grammar: 'hard-offset' }, evidence: 'E1' }
        ]
      },
      densityCadence: {
        values: [
          { id: 'focal-run', value: { cadence: ['focal', 'dense', 'sparse', 'dense'], scaleContrast: 'high' }, evidence: 'E5' },
          { id: 'even-pacing', value: { cadence: ['dense', 'dense', 'sparse', 'sparse'], scaleContrast: 'moderate' }, evidence: 'E5' }
        ]
      },
      artifact: {
        values: [
          { id: 'data-instrument', value: { class: 'data-instrument' }, evidence: 'E4' },
          { id: 'typographic', value: { class: 'typographic' }, evidence: 'E4' }
        ]
      }
    },
    evidence: {
      E1: { kind: 'observation', detail: 'the rendered ground is one flat neutral across both viewports' },
      E2: { kind: 'brief', detail: 'the brief asks for an identity that reads as an instrument, not a template' },
      E3: { kind: 'repository', detail: 'src/tokens.css already ships a tide-band ramp' },
      E4: { kind: 'observation', detail: 'the page is dominated by one metrics table' },
      E5: { kind: 'open-decision', detail: 'no evidence constrains focal placement or pacing, so both stay open' }
    }
  };
}

/** The single-value space: valid, but too small for three divergent variants. */
function narrowSpace() {
  const narrow = space();
  for (const axis of Object.values(narrow.axes)) axis.values = [axis.values[0]];
  return narrow;
}

function candidateManifest() {
  return {
    status: 'ok',
    provider: 'fontsource',
    providerSelectionReason: 'no Google key present',
    catalogOrigin: 'file',
    rankingMode: 'stratified-diversified',
    requestedConstraints: { allowedLicenses: null, deliveryModes: ['package'], network: false, existingOnly: false },
    enforcedConstraints: { allowedLicenses: null, deliveryModes: ['package'], network: false, existingOnly: false },
    unmetConstraints: [],
    cachePath: null,
    cacheAgeHours: null,
    roles: [
      {
        role: 'display',
        candidates: [{
          family: 'Instrument Serif', id: 'instrument-serif', category: 'serif',
          loadOptions: [{ mode: 'package', source: '@fontsource/instrument-serif' }]
        }]
      },
      {
        role: 'body',
        candidates: [{
          family: 'Public Sans', id: 'public-sans', category: 'sans-serif',
          loadOptions: [{ mode: 'package', source: '@fontsource/public-sans' }]
        }]
      }
    ]
  };
}

function candidateRole(family, id) {
  return {
    family, provenance: 'candidates', candidateId: id, provider: 'fontsource',
    selectedLoadMode: 'package', selectedLoadSource: `@fontsource/${id}`,
    matchEvidence: ['category', 'subsets'], sourceEvidence: null
  };
}

/** A container from --plan, filled the way the skill asks the model to fill it. */
function filledContainer(seed = 'atlas', variants = 2, source = space()) {
  const container = planDirections({ seed, variants, space: source });
  for (const contract of container.contracts) {
    contract.subjectMappings = [
      { evidence: 'E1', behavior: 'tide reaches its high mark twice a day', echo: 'the ground band shifts at the fold' },
      { evidence: 'E2', behavior: 'readings are taken on a fixed cadence', echo: 'the metric row keeps one rhythm' },
      { evidence: 'E4', behavior: 'the table is the instrument face', echo: 'the numeric column carries the accent' }
    ];
    contract.ground = {
      source: 'a single light field rising from the lower left',
      origin: 'E1',
      regions: ['page', 'header'],
      textSeparation: 'body ink sits on the darkest ninth of the field',
      reducedMotion: 'the field is static; no parallax'
    };
    contract.quietRegions = [{ region: 'upper right quarter', job: 'focal-isolation' }];
    contract.palette = { anchors: ['#0d2a33', '#e8dcc6'], regionalAssignment: 'accent carries the numeric column only' };
    contract.type = {
      traits: { display: 'high-contrast, constructed', body: 'neutral, tabular' },
      display: candidateRole('Instrument Serif', 'instrument-serif'),
      body: candidateRole('Public Sans', 'public-sans')
    };
    contract.materialLight = 'one light source at the upper left; shadows agree on direction';
    contract.motion = { decision: 'entrance fade under 200ms', reducedMotion: 'no transform, opacity only' };
    contract.expectations = [
      'the ground reads as a field, not a flat fill, at 390px and 1440px',
      'the numeric column is the only place the accent hue appears',
      'display and body are visibly different constructions at a glance'
    ];
  }
  return container;
}

async function checkCli(container, source, extra = []) {
  const contractsFile = await jsonFixture('contracts.json', container);
  const spaceFile = await jsonFixture('space.json', source);
  const result = await run(DIRECTION, ['--check', '--contracts', contractsFile, '--space', spaceFile, ...extra]);
  assert.equal(result.code, 0, result.stderr);
  return JSON.parse(result.stdout);
}

/** Run --check in process and return the finding codes it produced. */
function codesFor(mutate, { source = space(), candidates = candidateManifest() } = {}) {
  const container = filledContainer('atlas', 2, source);
  const mutatedSpace = clone(source);
  mutate(container, mutatedSpace);
  return checkContracts(container, mutatedSpace, { candidates }).findings.map((entry) => entry.code);
}

describe('direction.mjs --plan', () => {
  it('is byte-identical across runs with the same argv and space', async () => {
    const spaceFile = await jsonFixture('space.json', space());
    const first = await run(DIRECTION, ['--plan', '--seed', 'atlas', '--variants', '3', '--space', spaceFile]);
    const second = await run(DIRECTION, ['--plan', '--seed', 'atlas', '--variants', '3', '--space', spaceFile]);
    assert.equal(first.code, 0, first.stderr);
    assert.equal(first.stdout, second.stdout);
    assert.equal(JSON.parse(first.stdout).status, 'ok');
  });

  it('emits the canonical container that --check and --select consume unchanged', async () => {
    const container = planDirections({ seed: 'atlas', variants: 2, space: space() });
    assert.deepEqual(Object.keys(container).sort(), ['contracts', 'schemaVersion', 'seed', 'status']);
    assert.equal(container.schemaVersion, 1);
    assert.equal(container.seed, 'atlas');
    assert.equal(container.contracts[1].seed, 'atlas:1');
    const selected = selectContract(filledContainer(), 1);
    assert.deepEqual(selected.contract, filledContainer().contracts[1]);
  });

  it('deals different axes for different seeds', () => {
    const atlas = planDirections({ seed: 'atlas', variants: 2, space: space() });
    const harbor = planDirections({ seed: 'harbor', variants: 2, space: space() });
    const ids = (container) => container.contracts.map((contract) =>
      Object.values(contract.axes).map((axis) => axis.id).join(','));
    assert.notDeepEqual(ids(atlas), ids(harbor));
  });

  it('keeps every emitted pair at least three axes apart', () => {
    for (const variants of [2, 6]) {
      const container = planDirections({ seed: 'atlas', variants, space: space() });
      assert.equal(container.status, 'ok', JSON.stringify(container));
      assert.equal(container.contracts.length, variants);
      for (let left = 0; left < variants; left += 1) {
        for (let right = left + 1; right < variants; right += 1) {
          const distance = axisDistance(container.contracts[left], container.contracts[right]);
          assert.ok(distance >= 3, `variants ${left}/${right} differ on ${distance} axes`);
        }
      }
    }
  });

  it('draws every axis value from the supplied space, custom ids included', () => {
    const container = planDirections({ seed: 'atlas', variants: 3, space: space() });
    const dealtGroundIds = new Set(container.contracts.map((contract) => contract.axes.ground.id));
    assert.ok(dealtGroundIds.has('tide-band-strata'), 'a subject-derived custom id is dealable');
    for (const contract of container.contracts) {
      for (const [axisName, assigned] of Object.entries(contract.axes)) {
        const entry = space().axes[axisName].values.find((value) => value.id === assigned.id);
        assert.ok(entry, `${axisName}/${assigned.id} is outside the space`);
        assert.deepEqual(assigned.value, entry.value);
      }
    }
  });

  it('reports insufficient-space rather than falling back to built-in values', () => {
    const report = planDirections({ seed: 'atlas', variants: 3, space: narrowSpace() });
    assert.equal(report.status, 'insufficient-space');
    assert.equal(report.seed, 'atlas');
    assert.ok(report.detail.length > 0);
    assert.equal(report.contracts, undefined);
  });

  it('rejects a malformed space before dealing anything', () => {
    const cases = [
      ['missing-axis', (source) => { delete source.axes.material; }],
      ['invalid-axis-value-shape', (source) => { source.axes.ground.values[0].value = { mechanism: 'Light Field' }; }],
      ['invalid-axis-value-shape', (source) => { source.axes.densityCadence.values[0].value.cadence = ['focal', 'dense']; }],
      ['value-without-evidence', (source) => { source.axes.artifact.values[0].evidence = 'E9'; }],
      ['open-decision-without-reason', (source) => { source.evidence.E5.detail = '   '; }],
      ['unsupported-schema-version', (source) => { source.schemaVersion = 2; }]
    ];
    for (const [code, mutate] of cases) {
      const source = space();
      mutate(source);
      const report = planDirections({ seed: 'atlas', variants: 2, space: source });
      assert.equal(report.status, 'invalid', code);
      assert.ok(report.findings.some((entry) => entry.code === code),
        `${code} not in ${report.findings.map((entry) => entry.code).join(', ')}`);
    }
  });

  it('exits 0 with an invalid report rather than failing the process', async () => {
    const broken = space();
    broken.axes.artifact.values[0].evidence = 'E9';
    const spaceFile = await jsonFixture('space.json', broken);
    const result = await run(DIRECTION, ['--plan', '--seed', 'atlas', '--space', spaceFile]);
    assert.equal(result.code, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).status, 'invalid');
  });
});

describe('direction.mjs --check', () => {
  it('passes a fully filled, divergent set', async () => {
    const report = await checkCli(filledContainer(), space(),
      ['--candidates', await jsonFixture('font-candidates.json', candidateManifest())]);
    assert.deepEqual(report, { status: 'ok', findings: [] });
  });

  it('reports one code per contract defect', () => {
    const cases = [
      ['unsupported-schema-version', (container) => { container.contracts[0].schemaVersion = 2; }],
      ['seed-mismatch', (container) => { container.contracts[0].seed = 'atlas:7'; }],
      ['missing-field', (container) => { delete container.contracts[0].palette; }],
      ['missing-axis', (container) => { delete container.contracts[0].axes.material; }],
      ['invalid-axis-value-shape', (container) => { container.contracts[0].axes.ground.value = {}; }],
      ['value-outside-space', (container) => { container.contracts[0].axes.ground.id = 'nowhere-ground'; }],
      ['value-outside-space', (container) => { container.contracts[0].axes.ground.value.mechanism = 'tampered'; }],
      ['unresolved-evidence-reference', (container) => { container.contracts[0].subjectMappings[0].evidence = 'E9'; }],
      ['unresolved-evidence-reference', (container) => { container.contracts[0].ground.origin = 'E9'; }],
      ['too-few-mappings', (container) => { container.contracts[0].subjectMappings.length = 2; }],
      ['quiet-region-without-job', (container) => { container.contracts[0].quietRegions = [{ region: 'left rail' }]; }],
      ['invalid-quiet-job', (container) => { container.contracts[0].quietRegions[0].job = 'breathing-room'; }],
      ['axis-duplicate-field', (container) => { container.contracts[0].ground.mechanism = 'light-field'; }],
      ['axis-duplicate-field', (container) => { container.contracts[0].palette.topology = 'regional'; }],
      ['too-few-expectations', (container) => { container.contracts[0].expectations.length = 2; }],
      ['prose-overflow', (container) => { container.contracts[0].materialLight = 'x'.repeat(300); }],
      ['prose-overflow', (container) => { container.contracts[0].ground.regions = Array.from({ length: 9 }, (value, index) => `r${index}`); }],
      ['value-without-evidence', (container, source) => { source.axes.artifact.values[0].evidence = 'E9'; }],
      ['unfilled-field', (container) => { container.contracts[0].ground.source = '   '; }],
      ['unfilled-field', (container) => { container.contracts[0].ground.regions = []; }],
      ['unfilled-field', (container) => { container.contracts[0].palette.anchors = []; }],
      ['unfilled-field', (container) => { container.contracts[0].palette.regionalAssignment = ''; }],
      ['unfilled-field', (container) => { container.contracts[0].materialLight = ''; }],
      ['unfilled-field', (container) => { container.contracts[0].motion.reducedMotion = ''; }],
      ['unfilled-field', (container) => { container.contracts[0].quietRegions = []; }]
    ];
    for (const [code, mutate] of cases) {
      const codes = codesFor(mutate);
      assert.ok(codes.includes(code), `${code} not in ${codes.join(', ') || '(none)'}`);
    }
  });

  // The planner's own skeleton carries every required key already, so a `--check`
  // that only tests presence would pass an entirely undesigned variant.
  it('rejects the unfilled skeleton the planner emits', () => {
    const container = planDirections({ seed: 'atlas', variants: 2, space: space() });
    const report = checkContracts(container, space());
    assert.equal(report.status, 'invalid');
    assert.ok(report.findings.some((entry) => entry.code === 'unfilled-field'),
      `no unfilled-field in ${report.findings.map((entry) => entry.code).join(', ')}`);
  });

  it('fails nominal-only divergence: same axes, different prose', () => {
    const container = filledContainer();
    container.contracts[1].axes = clone(container.contracts[0].axes);
    container.contracts[1].seed = 'atlas:1';
    container.contracts[1].materialLight = 'a different sentence entirely, describing the very same decisions';
    const report = checkContracts(container, space(), { candidates: candidateManifest() });
    assert.ok(report.findings.some((entry) => entry.code === 'insufficient-divergence'));
  });

  it('rejects a container schemaVersion other than 1', () => {
    const container = filledContainer();
    container.schemaVersion = 2;
    const report = checkContracts(container, space(), { candidates: candidateManifest() });
    assert.equal(report.status, 'invalid');
    assert.deepEqual(report.findings.map((entry) => entry.code), ['unsupported-schema-version']);
  });

  it('verifies font provenance against the frozen manifest instead of trusting the label', () => {
    const cases = [
      ['candidate-manifest-required', (container) => container, { candidates: null }],
      ['candidate-not-found', (container) => { container.contracts[0].type.display.candidateId = 'ghost-serif'; }],
      ['candidate-role-mismatch', (container) => {
        container.contracts[0].type.body = candidateRole('Instrument Serif', 'instrument-serif');
      }],
      ['candidate-provider-mismatch', (container) => { container.contracts[0].type.display.provider = 'google'; }],
      ['candidate-load-mode-not-eligible', (container) => {
        container.contracts[0].type.display.selectedLoadMode = 'remote-css';
      }],
      ['candidate-load-mode-not-eligible', (container) => {
        container.contracts[0].type.display.selectedLoadSource = 'https://example.test/font.css';
      }],
      ['missing-field', (container) => { container.contracts[0].type.display.candidateId = null; }],
      ['family-before-candidates', (container) => { container.contracts[0].type.display.provenance = null; }],
      ['repository-font-source-missing', (container) => {
        container.contracts[0].type.display = { ...candidateRole('Existing Sans', 'existing-sans'), provenance: 'repository', sourceEvidence: null };
      }],
      ['brief-font-source-missing', (container) => {
        container.contracts[0].type.display = { ...candidateRole('Brief Sans', 'brief-sans'), provenance: 'brief', sourceEvidence: null };
      }]
    ];
    for (const [code, mutate, options] of cases) {
      const codes = codesFor(mutate, options);
      assert.ok(codes.includes(code), `${code} not in ${codes.join(', ') || '(none)'}`);
    }
  });

  it('refuses a restricted or unmet-constraint manifest as a selection basis', () => {
    for (const manifest of [
      { ...candidateManifest(), status: 'restricted' },
      { ...candidateManifest(), unmetConstraints: ['allowedLicenses'] }
    ]) {
      const codes = codesFor(() => {}, { candidates: manifest });
      assert.ok(codes.includes('candidate-result-not-eligible'), codes.join(', ') || '(none)');
    }
  });

  it('accepts repository and brief provenance backed by their source evidence', () => {
    const codes = codesFor((container) => {
      container.contracts[0].type.display = {
        family: 'Existing Sans', provenance: 'repository', candidateId: null, provider: null,
        selectedLoadMode: null, selectedLoadSource: null, matchEvidence: [],
        sourceEvidence: 'src/styles/fonts.css declares @font-face Existing Sans'
      };
      container.contracts[0].type.body = {
        family: 'Brief Sans', provenance: 'brief', candidateId: null, provider: null,
        selectedLoadMode: null, selectedLoadSource: null, matchEvidence: [],
        sourceEvidence: 'the brief requires "Brief Sans, the corporate face"'
      };
    });
    assert.deepEqual(codes, []);
  });
});

describe('direction.mjs --select', () => {
  it('freezes exactly the container metadata plus the chosen contract', async () => {
    const container = filledContainer();
    const contractsFile = await jsonFixture('contracts.json', container);
    const first = await run(DIRECTION, ['--select', '--contracts', contractsFile, '--index', '1']);
    const second = await run(DIRECTION, ['--select', '--contracts', contractsFile, '--index', '1']);
    assert.equal(first.code, 0, first.stderr);
    assert.equal(first.stdout, second.stdout);
    const selected = JSON.parse(first.stdout);
    assert.deepEqual(Object.keys(selected).sort(), ['contract', 'schemaVersion', 'seed', 'selectedIndex']);
    assert.equal(selected.selectedIndex, 1);
    assert.deepEqual(selected.contract, container.contracts[1]);
    assert.equal(selected.contract.type.display.provenance, 'candidates');
  });

  it('exits 2 for an out-of-range or non-integer index', async () => {
    const contractsFile = await jsonFixture('contracts.json', filledContainer());
    for (const index of ['9', '1.5', 'first']) {
      const result = await run(DIRECTION, ['--select', '--contracts', contractsFile, '--index', index]);
      assert.equal(result.code, 2, `--index ${index}`);
      assert.equal(result.stdout, '');
    }
  });
});

describe('direction.mjs usage contract', () => {
  it('exposes the axis vocabulary as shapes, not as a compulsory option set', () => {
    assert.deepEqual(Object.keys(VOCABULARY), [
      'composition', 'ground', 'colorTopology', 'type', 'material', 'densityCadence', 'artifact'
    ]);
    assert.ok(VOCABULARY.ground.valid({ mechanism: 'tide-band-strata' }), 'a custom token passes the ground shape');
    assert.ok(!VOCABULARY.ground.valid({ mechanism: 'Tide Band' }));
  });

  it('exits 2 without stdout for every usage error', async () => {
    const spaceFile = await jsonFixture('space.json', space());
    const contractsFile = await jsonFixture('contracts.json', filledContainer());
    const brokenFile = await jsonFixture('broken.json', { schemaVersion: 1 });
    const invalid = [
      [],
      ['--plan', '--seed', 'atlas'],
      ['--plan', '--space', spaceFile],
      ['--plan', '--seed', 'not a token', '--space', spaceFile],
      ['--plan', '--seed', 'atlas', '--space', spaceFile, '--variants', '7'],
      ['--plan', '--seed', 'atlas', '--space', spaceFile, '--variants', 'many'],
      ['--plan', '--check', '--seed', 'atlas', '--space', spaceFile],
      ['--check', '--contracts', contractsFile],
      ['--check', '--contracts', contractsFile, '--space', '/nonexistent/space.json'],
      ['--select', '--contracts', contractsFile],
      ['--select', '--contracts', brokenFile, '--index', '0'],
      ['--plan', '--seed', 'atlas', '--space', spaceFile, '--nope']
    ];
    for (const args of invalid) {
      const result = await run(DIRECTION, args);
      assert.equal(result.code, 2, `${args.join(' ')} → ${result.stderr}`);
      assert.equal(result.stdout, '');
      assert.ok(result.stderr.length > 0);
    }
  });

  it('exits 2 on a file that is not JSON', async () => {
    const spaceFile = await jsonFixture('space.json', space());
    const result = await run(DIRECTION, ['--plan', '--seed', 'atlas', '--space', `${spaceFile}.missing`]);
    assert.equal(result.code, 2);
    assert.equal(result.stdout, '');
  });
});

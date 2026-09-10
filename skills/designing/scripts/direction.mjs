// Deal seeded, divergent direction axes inside a project's own axis space, then
// validate and freeze the filled direction contracts. The vocabulary below fixes
// the shape of an axis value and names the values a space may reuse; it is never
// the option set. Every dealt value comes from the supplied space, so a direction
// is traceable to Phase 1 evidence rather than to this file. Nothing is written.
//
//   node scripts/direction.mjs --plan --seed <token> --space <file> [--variants <2..6>]
//   node scripts/direction.mjs --check --contracts <file> --space <file> [--candidates <file>]
//   node scripts/direction.mjs --select --contracts <file> --index <n>
//
// --space is JSON, written from this header rather than from the validators
// below: {"schemaVersion":1,"axes":{<axis>:{"values":[{"id":<token>,
// "value":<payload>,"evidence":<key>}]}},"evidence":{<key>:{"kind":<kind>,
// "detail":<why>}}}. The seven axes and their payloads: composition
// {focalX,focalY: 0..1, asymmetry: token}; ground {mechanism}; colorTopology
// {topology, commitment}; type {strategy}; material {grammar}; densityCadence
// {cadence: [focal|dense|sparse, ...], scaleContrast}; artifact {class}. An id
// or token is [a-z0-9-]+ and names a Phase 1 finding, never a built-in option;
// every axis lists two or more values; an evidence kind is observation, brief,
// repository or open-decision, and open-decision still records its reason.
// --check names the shape and the allowed vocabulary of anything it rejects.

import process from 'node:process';
import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { parseFlags, readJsonFlag, UsageError } from './capture.mjs';
import { createPrng, shuffledRange } from './seeded.mjs';

const TOKEN = /^[a-z0-9-]+$/;
const SEED_TOKEN = /^[A-Za-z0-9._-]+$/;
const MAX_STRING = 240;
const MAX_ITEMS = 8;
const ENUMERATION_LIMIT = 65_536;
const SAMPLE_ATTEMPTS = 4096;
// Planning and checking read the same floor: a lower one here would emit containers
// `--check` then rejects, a higher one would reject containers `--plan` just wrote.
const MIN_AXIS_DIVERGENCE = 3;

const isToken = (value) => typeof value === 'string' && TOKEN.test(value);
const isUnitNumber = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
const hasExactKeys = (value, keys) =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every((key) => key in value);

const CADENCE_STEPS = ['focal', 'dense', 'sparse'];

/**
 * Per-axis payload shape only — deliberately no list of value ids. Supplying
 * built-in options would make them the default answer; a subject-derived id
 * with a shape-valid payload is equally legal, and --plan draws only from the
 * space it is given.
 */
export const VOCABULARY = {
  composition: {
    keys: ['focalX', 'focalY', 'asymmetry'],
    valid: (value) =>
      hasExactKeys(value, ['focalX', 'focalY', 'asymmetry'])
      && isUnitNumber(value.focalX) && isUnitNumber(value.focalY) && isToken(value.asymmetry)
  },
  ground: {
    keys: ['mechanism'],
    valid: (value) => hasExactKeys(value, ['mechanism']) && isToken(value.mechanism)
  },
  colorTopology: {
    keys: ['topology', 'commitment'],
    valid: (value) =>
      hasExactKeys(value, ['topology', 'commitment']) && isToken(value.topology) && isToken(value.commitment)
  },
  type: {
    keys: ['strategy'],
    valid: (value) => hasExactKeys(value, ['strategy']) && isToken(value.strategy)
  },
  material: {
    keys: ['grammar'],
    valid: (value) => hasExactKeys(value, ['grammar']) && isToken(value.grammar)
  },
  densityCadence: {
    keys: ['cadence', 'scaleContrast'],
    valid: (value) =>
      hasExactKeys(value, ['cadence', 'scaleContrast'])
      && Array.isArray(value.cadence) && value.cadence.length === 4
      && value.cadence.every((step) => CADENCE_STEPS.includes(step))
      && isToken(value.scaleContrast)
  },
  artifact: {
    keys: ['class'],
    valid: (value) => hasExactKeys(value, ['class']) && isToken(value.class)
  }
};

export const AXIS_NAMES = Object.keys(VOCABULARY);

const EVIDENCE_KINDS = ['observation', 'brief', 'repository', 'open-decision'];

const QUIET_JOBS = [
  'focal-isolation', 'pacing', 'transition', 'staging',
  'navigation-clearance', 'interaction-clearance', 'grouping-separation', 'edge-tension'
];

const FONT_PROVENANCE = ['candidates', 'repository', 'brief'];

// A semantic block may extend its axis but never restate it: the dealt payload
// is the single source of truth for what the axis decided.
const RESERVED_SEMANTIC_KEYS = {
  ground: ['mechanism'],
  palette: ['topology', 'commitment'],
  type: ['strategy'],
  motion: []
};

const finding = (code, variant, detail) => ({ code, variant, detail });

// --- axis space ------------------------------------------------------------

function evidenceFindings(space, axisName, entry) {
  const record = space.evidence?.[entry.evidence];
  const where = `axis '${axisName}' value '${entry.id}'`;
  if (typeof entry.evidence !== 'string' || !record || !EVIDENCE_KINDS.includes(record.kind)) {
    return [finding('value-without-evidence', null, `${where} names no resolvable evidence entry`)];
  }
  const detail = typeof record.detail === 'string' ? record.detail.trim() : '';
  if (detail.length > 0) return [];
  if (record.kind === 'open-decision') {
    return [finding('open-decision-without-reason', null,
      `${where} rests on open decision '${entry.evidence}', which records no reason`)];
  }
  return [finding('value-without-evidence', null, `${where} names evidence '${entry.evidence}' with no detail`)];
}

export function validateSpace(space) {
  if (space?.schemaVersion !== 1) {
    return [finding('unsupported-schema-version', null, `axis space schemaVersion must be 1, received ${JSON.stringify(space?.schemaVersion)}`)];
  }
  const findings = [];
  for (const axisName of AXIS_NAMES) {
    const values = space.axes?.[axisName]?.values;
    if (!Array.isArray(values) || values.length === 0) {
      findings.push(finding('missing-axis', null, `axis '${axisName}' is absent from the space or lists no value`));
      continue;
    }
    for (const entry of values) {
      if (!isToken(entry?.id)) {
        findings.push(finding('invalid-axis-value-shape', null, `axis '${axisName}' has a value whose id is not [a-z0-9-]+`));
        continue;
      }
      if (!VOCABULARY[axisName].valid(entry.value)) {
        findings.push(finding('invalid-axis-value-shape', null,
          `axis '${axisName}' value '${entry.id}' does not match the ${VOCABULARY[axisName].keys.join('/')} shape`));
      }
      findings.push(...evidenceFindings(space, axisName, entry));
    }
  }
  return findings;
}

function assignmentAt(space, indices) {
  const axes = {};
  AXIS_NAMES.forEach((axisName, position) => {
    const entry = space.axes[axisName].values[indices[position]];
    axes[axisName] = { id: entry.id, value: entry.value };
  });
  return axes;
}

function* seededAssignments(space, prng) {
  const sizes = AXIS_NAMES.map((axisName) => space.axes[axisName].values.length);
  const product = sizes.reduce((total, size) => total * size, 1);
  if (product <= ENUMERATION_LIMIT) {
    for (const ordinal of shuffledRange(product, prng)) {
      let remainder = ordinal;
      const indices = sizes.map((size) => {
        const index = remainder % size;
        remainder = Math.floor(remainder / size);
        return index;
      });
      yield assignmentAt(space, indices);
    }
    return;
  }
  for (let attempt = 0; attempt < SAMPLE_ATTEMPTS; attempt += 1) {
    yield assignmentAt(space, sizes.map((size) => prng.below(size)));
  }
}

// --- divergence ------------------------------------------------------------

function axisValueDiffers(axisName, left, right) {
  if (axisName === 'composition') {
    return left.focalX !== right.focalX || left.focalY !== right.focalY || left.asymmetry !== right.asymmetry;
  }
  if (axisName === 'densityCadence') {
    return left.cadence.join('>') !== right.cadence.join('>');
  }
  return JSON.stringify(left) !== JSON.stringify(right);
}

/** Distance between two contracts over the seven axes, computed from the dealt
 *  payloads. Renaming a value id without changing its payload changes nothing. */
export function axisDistance(left, right) {
  return AXIS_NAMES.filter((axisName) => {
    const a = left?.axes?.[axisName]?.value;
    const b = right?.axes?.[axisName]?.value;
    if (!VOCABULARY[axisName].valid(a) || !VOCABULARY[axisName].valid(b)) return true;
    return axisValueDiffers(axisName, a, b);
  }).length;
}

// --- planning --------------------------------------------------------------

const emptyRole = () => ({
  family: null, provenance: null, candidateId: null, provider: null,
  selectedLoadMode: null, selectedLoadSource: null, matchEvidence: [], sourceEvidence: null
});

function contractSkeleton(seed, index, axes) {
  return {
    schemaVersion: 1,
    seed: `${seed}:${index}`,
    axes,
    subjectMappings: [],
    ground: { source: '', origin: '', regions: [], textSeparation: '', reducedMotion: '' },
    quietRegions: [],
    palette: { anchors: [], regionalAssignment: '' },
    type: { traits: {}, display: emptyRole(), body: emptyRole() },
    materialLight: '',
    motion: { decision: '', reducedMotion: '' },
    expectations: []
  };
}

export function planDirections({ seed, variants, space }) {
  const spaceFindings = validateSpace(space);
  if (spaceFindings.length > 0) {
    return { schemaVersion: 1, status: 'invalid', seed, findings: spaceFindings };
  }

  const contracts = [];
  for (let index = 0; index < variants; index += 1) {
    const prng = createPrng(`${seed}:${index}`);
    let placed = null;
    for (const axes of seededAssignments(space, prng)) {
      const candidate = contractSkeleton(seed, index, axes);
      if (contracts.every((accepted) => axisDistance(accepted, candidate) >= MIN_AXIS_DIVERGENCE)) {
        placed = candidate;
        break;
      }
    }
    if (!placed) {
      return {
        schemaVersion: 1,
        status: 'insufficient-space',
        seed,
        detail: `the seeded search over the supplied axis space placed ${index} of ${variants} variants at pairwise distance 3; widen the space with more evidence-backed values`
      };
    }
    contracts.push(placed);
  }
  return { schemaVersion: 1, status: 'ok', seed, contracts };
}

// --- contract validation ---------------------------------------------------

function proseFindings(value, variant, trail) {
  if (typeof value === 'string') {
    return value.length > MAX_STRING
      ? [finding('prose-overflow', variant, `${trail} holds ${value.length} characters, over the ${MAX_STRING} cap`)]
      : [];
  }
  if (Array.isArray(value)) {
    const own = value.length > MAX_ITEMS
      ? [finding('prose-overflow', variant, `${trail} holds ${value.length} items, over the ${MAX_ITEMS} cap`)]
      : [];
    return value.reduce((all, item, index) => all.concat(proseFindings(item, variant, `${trail}[${index}]`)), own);
  }
  if (value !== null && typeof value === 'object') {
    return Object.entries(value).reduce(
      (all, [key, item]) => all.concat(proseFindings(item, variant, `${trail}.${key}`)), []);
  }
  return [];
}

function axisFindings(contract, space, variant) {
  const findings = [];
  for (const axisName of AXIS_NAMES) {
    const assigned = contract.axes?.[axisName];
    if (!assigned || typeof assigned !== 'object') {
      findings.push(finding('missing-axis', variant, `contract carries no '${axisName}' axis`));
      continue;
    }
    if (!VOCABULARY[axisName].valid(assigned.value)) {
      findings.push(finding('invalid-axis-value-shape', variant,
        `axis '${axisName}' payload does not match the ${VOCABULARY[axisName].keys.join('/')} shape`));
      continue;
    }
    const entry = space.axes[axisName].values.find((value) => value.id === assigned.id);
    if (!entry || JSON.stringify(entry.value) !== JSON.stringify(assigned.value)) {
      findings.push(finding('value-outside-space', variant,
        `axis '${axisName}' value '${assigned.id}' is absent from the supplied space or its payload was altered`));
    }
  }
  for (const [block, reserved] of Object.entries(RESERVED_SEMANTIC_KEYS)) {
    const held = contract[block];
    if (held === null || typeof held !== 'object') continue;
    for (const key of reserved) {
      if (key in held) {
        findings.push(finding('axis-duplicate-field', variant,
          `'${block}.${key}' restates an axis payload; the dealt axis value is authoritative`));
      }
    }
  }
  return findings;
}

function evidenceReferenceFindings(contract, space, variant) {
  const findings = [];
  const resolves = (key) => typeof key === 'string' && Boolean(space.evidence?.[key]);
  const mappings = Array.isArray(contract.subjectMappings) ? contract.subjectMappings : [];
  if (mappings.length < 3) {
    findings.push(finding('too-few-mappings', variant, `${mappings.length} subject mappings, at least 3 required`));
  }
  mappings.forEach((mapping, index) => {
    if (!resolves(mapping?.evidence)) {
      findings.push(finding('unresolved-evidence-reference', variant,
        `subjectMappings[${index}].evidence '${mapping?.evidence}' names no space evidence entry`));
    }
  });
  if (!resolves(contract.ground?.origin)) {
    findings.push(finding('unresolved-evidence-reference', variant,
      `ground.origin '${contract.ground?.origin}' names no space evidence entry`));
  }
  return findings;
}

function quietRegionFindings(contract, variant) {
  const regions = Array.isArray(contract.quietRegions) ? contract.quietRegions : [];
  return regions.flatMap((region, index) => {
    if (typeof region?.job !== 'string' || region.job.length === 0) {
      return [finding('quiet-region-without-job', variant, `quietRegions[${index}] plans a quiet region with no job`)];
    }
    if (!QUIET_JOBS.includes(region.job)) {
      return [finding('invalid-quiet-job', variant,
        `quietRegions[${index}].job '${region.job}' is outside the job enum ${QUIET_JOBS.join(', ')}`)];
    }
    return [];
  });
}

function locateCandidate(manifest, role, family, candidateId) {
  for (const entry of manifest.roles ?? []) {
    for (const candidate of entry.candidates ?? []) {
      if (candidate.id === candidateId && candidate.family === family) {
        return { role: entry.role, candidate };
      }
    }
  }
  return null;
}

function candidateFindings(role, spec, manifest, variant) {
  if (!manifest) {
    return [finding('candidate-manifest-required', variant,
      `${role} claims candidate provenance but no --candidates manifest was supplied`)];
  }
  if (manifest.status !== 'ok' || (manifest.unmetConstraints ?? []).length > 0) {
    return [finding('candidate-result-not-eligible', variant,
      `the ${role} manifest reports status '${manifest.status}' with unmet constraints ${JSON.stringify(manifest.unmetConstraints ?? [])}`)];
  }
  const located = locateCandidate(manifest, role, spec.family, spec.candidateId);
  if (!located) {
    return [finding('candidate-not-found', variant,
      `no eligible candidate '${spec.candidateId}' for family '${spec.family}' appears in the manifest`)];
  }
  if (located.role !== role) {
    return [finding('candidate-role-mismatch', variant,
      `candidate '${spec.candidateId}' was resolved for role '${located.role}', not '${role}'`)];
  }
  if (manifest.provider !== spec.provider) {
    return [finding('candidate-provider-mismatch', variant,
      `${role} records provider '${spec.provider}' but the manifest came from '${manifest.provider}'`)];
  }
  const enforced = manifest.enforcedConstraints?.deliveryModes ?? null;
  const matched = (located.candidate.loadOptions ?? []).some(
    (option) => option.mode === spec.selectedLoadMode && option.source === spec.selectedLoadSource
      && (enforced === null || enforced.includes(option.mode)));
  if (!matched) {
    return [finding('candidate-load-mode-not-eligible', variant,
      `${role} load '${spec.selectedLoadMode}' from '${spec.selectedLoadSource}' is not an enforced load option of the candidate`)];
  }
  return [];
}

const REQUIRED_CANDIDATE_FIELDS = ['family', 'candidateId', 'provider', 'selectedLoadMode', 'selectedLoadSource'];

function fontFindings(contract, manifest, variant) {
  return ['display', 'body'].flatMap((role) => {
    const spec = contract.type?.[role];
    if (!spec || typeof spec !== 'object') {
      return [finding('missing-field', variant, `type.${role} is absent`)];
    }
    if (spec.family !== null && !FONT_PROVENANCE.includes(spec.provenance)) {
      return [finding('family-before-candidates', variant,
        `type.${role} names family '${spec.family}' under provenance ${JSON.stringify(spec.provenance)}`)];
    }
    if (spec.provenance === 'candidates') {
      const missing = REQUIRED_CANDIDATE_FIELDS.filter((field) => !spec[field]);
      if (missing.length > 0 || (spec.matchEvidence ?? []).length === 0) {
        return [finding('missing-field', variant,
          `type.${role} claims candidate provenance without ${[...missing, ...((spec.matchEvidence ?? []).length === 0 ? ['matchEvidence'] : [])].join(', ')}`)];
      }
      return candidateFindings(role, spec, manifest, variant);
    }
    if (spec.provenance === 'repository' && !spec.sourceEvidence) {
      return [finding('repository-font-source-missing', variant,
        `type.${role} claims repository provenance without naming the font declaration or package path`)];
    }
    if (spec.provenance === 'brief' && !spec.sourceEvidence) {
      return [finding('brief-font-source-missing', variant,
        `type.${role} claims brief provenance without quoting the requirement`)];
    }
    return [];
  });
}

const REQUIRED_CONTRACT_FIELDS = [
  'axes', 'subjectMappings', 'ground', 'quietRegions', 'palette', 'type', 'materialLight', 'motion', 'expectations'
];

// The skeleton `--plan` emits carries every required key already, so presence
// alone proves nothing: these are the leaves a variant is undesigned without.
const REQUIRED_CONTRACT_PROSE = [
  'ground.source', 'ground.origin', 'ground.textSeparation', 'ground.reducedMotion',
  'palette.regionalAssignment', 'materialLight', 'motion.decision', 'motion.reducedMotion'
];

const REQUIRED_CONTRACT_LISTS = ['ground.regions', 'quietRegions', 'palette.anchors'];

function atPath(contract, path) {
  return path.split('.').reduce((value, key) => (value === null || value === undefined ? value : value[key]), contract);
}

function substanceFindings(contract, variant) {
  const findings = [];
  for (const path of REQUIRED_CONTRACT_PROSE) {
    const value = atPath(contract, path);
    if (typeof value !== 'string' || value.trim().length === 0) {
      findings.push(finding('unfilled-field', variant, `${path} is still empty; the planner's skeleton was not filled`));
    }
  }
  for (const path of REQUIRED_CONTRACT_LISTS) {
    const value = atPath(contract, path);
    if (!Array.isArray(value) || value.length === 0) {
      findings.push(finding('unfilled-field', variant, `${path} is empty; the planner's skeleton was not filled`));
    }
  }
  return findings;
}

function contractFindings(contract, index, { space, seed, manifest }) {
  const findings = [];
  if (contract?.schemaVersion !== 1) {
    return [finding('unsupported-schema-version', index,
      `contract schemaVersion must be 1, received ${JSON.stringify(contract?.schemaVersion)}`)];
  }
  if (contract.seed !== `${seed}:${index}`) {
    findings.push(finding('seed-mismatch', index, `contract seed '${contract.seed}' is not '${seed}:${index}'`));
  }
  const missing = REQUIRED_CONTRACT_FIELDS.filter((field) => contract[field] === undefined);
  if (missing.length > 0) {
    findings.push(finding('missing-field', index, `contract omits ${missing.join(', ')}`));
    return findings;
  }
  findings.push(...substanceFindings(contract, index));
  findings.push(...axisFindings(contract, space, index));
  findings.push(...evidenceReferenceFindings(contract, space, index));
  findings.push(...quietRegionFindings(contract, index));
  findings.push(...fontFindings(contract, manifest, index));
  const expectations = Array.isArray(contract.expectations) ? contract.expectations : [];
  if (expectations.length < 3) {
    findings.push(finding('too-few-expectations', index,
      `${expectations.length} render-checkable expectations, at least 3 required`));
  }
  findings.push(...proseFindings(contract, index, 'contract'));
  return findings;
}

export function checkContracts(container, space, { candidates = null } = {}) {
  const spaceFindings = validateSpace(space);
  if (spaceFindings.length > 0) return { status: 'invalid', findings: spaceFindings };
  if (container?.schemaVersion !== 1) {
    return {
      status: 'invalid',
      findings: [finding('unsupported-schema-version', null,
        `container schemaVersion must be 1, received ${JSON.stringify(container?.schemaVersion)}`)]
    };
  }
  if (!Array.isArray(container.contracts) || container.contracts.length === 0) {
    return { status: 'invalid', findings: [finding('missing-field', null, 'container carries no contracts array')] };
  }

  const findings = container.contracts.flatMap((contract, index) =>
    contractFindings(contract, index, { space, seed: container.seed, manifest: candidates }));

  for (let left = 0; left < container.contracts.length; left += 1) {
    for (let right = left + 1; right < container.contracts.length; right += 1) {
      const distance = axisDistance(container.contracts[left], container.contracts[right]);
      if (distance < MIN_AXIS_DIVERGENCE) {
        findings.push(finding('insufficient-divergence', right,
          `variants ${left} and ${right} differ on ${distance} axes; renaming values without changing payloads is not divergence`));
      }
    }
  }
  return { status: findings.length === 0 ? 'ok' : 'invalid', findings };
}

export function selectContract(container, index) {
  if (!Array.isArray(container?.contracts)) throw new UsageError('--contracts file carries no contracts array');
  if (!Number.isInteger(index) || index < 0 || index >= container.contracts.length) {
    throw new UsageError(`--index must name one of the ${container.contracts.length} contracts`);
  }
  return {
    schemaVersion: 1,
    seed: container.seed,
    selectedIndex: index,
    contract: container.contracts[index]
  };
}

// --- CLI -------------------------------------------------------------------

function requireVariants(text) {
  if (text === undefined) return 2;
  const count = Number(text);
  if (!Number.isInteger(count) || count < 2 || count > 6) {
    throw new UsageError(`--variants must be an integer from 2 to 6, received '${text}'`);
  }
  return count;
}

function requireIndex(text) {
  if (text === undefined) throw new UsageError('--index is required with --select');
  const index = Number(text);
  if (!Number.isInteger(index)) throw new UsageError(`--index must be an integer, received '${text}'`);
  return index;
}

async function main(argv) {
  const flags = parseFlags(argv, {
    plan: 'boolean', check: 'boolean', select: 'boolean',
    seed: 'value', space: 'value', variants: 'value',
    contracts: 'value', candidates: 'value', index: 'value'
  });
  const modes = ['plan', 'check', 'select'].filter((mode) => flags[mode]);
  if (modes.length !== 1) throw new UsageError('exactly one of --plan, --check or --select is required');

  if (modes[0] === 'plan') {
    if (!flags.seed) throw new UsageError('--seed is required with --plan');
    if (!SEED_TOKEN.test(flags.seed)) throw new UsageError('--seed must be a plain file-name token');
    const variants = requireVariants(flags.variants);
    const space = await readJsonFlag(flags.space, '--space');
    return planDirections({ seed: flags.seed, variants, space });
  }

  if (modes[0] === 'check') {
    const container = await readJsonFlag(flags.contracts, '--contracts');
    const space = await readJsonFlag(flags.space, '--space');
    const candidates = flags.candidates ? await readJsonFlag(flags.candidates, '--candidates') : null;
    return checkContracts(container, space, { candidates });
  }

  const container = await readJsonFlag(flags.contracts, '--contracts');
  return selectContract(container, requireIndex(flags.index));
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

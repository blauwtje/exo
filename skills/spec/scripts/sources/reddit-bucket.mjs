import process from 'node:process';
import { environmentMs } from '#script-flags';
import { lifetimeMs, SPEC_SEARCH_LIFETIME_MS } from '#lifetime';
import { BlockedRoute } from './http.mjs';
import { sleep as pauseNow } from '#basics';
import { createHostState } from './host-state.mjs';

const USER_AGENT = 'exo-research/1.0 (Claude Code plugin; +https://github.com/blauwtje/exo)';
const FALLBACK_RESET_S = 10;
const HOST = 'reddit.com';

function searchLimitMs() {
  return lifetimeMs('spec-search', SPEC_SEARCH_LIFETIME_MS);
}

export function createBucket({ capacity, refillMs, now, sleep, hostState, host, maxWaitMs = Infinity }) {
  const state = { tokens: capacity, checkedAt: now() };

  function refill() {
    const elapsed = now() - state.checkedAt;
    state.checkedAt += elapsed;
    state.tokens = Math.min(capacity, state.tokens + elapsed / refillMs);
  }

  async function pauseFor(ms, pause) {
    if (ms > maxWaitMs) throw new BlockedRoute(`rate limit wait of ${ms} ms is over the ${maxWaitMs} ms cap`);
    await (pause ?? sleep)(ms);
  }

  async function take(pause) {
    const shared = hostState ? hostState.budgetWaitMs(host) : 0;
    if (shared > 0) await pauseFor(shared, pause);
    refill();
    if (state.tokens >= 1) {
      state.tokens -= 1;
      return;
    }
    await pauseFor(Math.ceil((1 - state.tokens) * refillMs), pause);
    return take(pause);
  }

  return { take };
}

export function threadWait(totalMs, pauseFor) {
  const wait = { leftMs: totalMs };
  wait.pause = async (ms) => {
    if (ms > wait.leftMs) throw new BlockedRoute(`thread wait of ${ms} ms is over the ${wait.leftMs} ms left for this thread`);
    wait.leftMs -= ms;
    await pauseFor(ms);
  };
  return wait;
}

function endpointOf(url) {
  if (url.includes('/svc/shreddit/')) return `${HOST}/shreddit`;
  return url.includes('.rss') ? `${HOST}/rss` : `${HOST}/page`;
}

function createLimits(context, settings) {
  const { sleep: injected = pauseNow, now = Date.now, env = process.env } = context;
  const capMs = environmentMs('EXO_REDDIT_WAIT_MS', settings.waitCapMs, env);
  const budget = { leftMs: searchLimitMs() - capMs };
  const sleep = async (ms) => {
    if (ms > budget.leftMs) throw new BlockedRoute(`search wait of ${ms} ms is over the ${budget.leftMs} ms left before the ${searchLimitMs()} ms search limit`);
    budget.leftMs -= ms;
    await injected(ms);
  };
  const hostState = context.stateDir ? createHostState({ dir: context.stateDir, now, env }) : null;
  const buckets = new Map();
  const bucketFor = (endpoint) => {
    const options = { capacity: settings.capacity, refillMs: settings.refillMs, now, sleep, hostState, host: endpoint, maxWaitMs: capMs };
    if (!buckets.has(endpoint)) buckets.set(endpoint, createBucket(options));
    return buckets.get(endpoint);
  };
  return { capMs, hostState, bucketFor, now, pauseFor: sleep };
}

function recordBudget({ hostState, now }, endpoint, response) {
  const remaining = Number.parseFloat(response.headers.get('x-ratelimit-remaining'));
  const seconds = Number.parseFloat(response.headers.get('x-ratelimit-reset'));
  if (!hostState || !Number.isFinite(remaining) || !Number.isFinite(seconds)) return;
  hostState.recordBudget(endpoint, { remaining, resetAt: now() + seconds * 1000 });
}

async function waitForReset(limits, response, pause) {
  const seconds = Number.parseFloat(response.headers.get('x-ratelimit-reset'));
  const waitMs = (Number.isFinite(seconds) ? seconds : FALLBACK_RESET_S) * 1000;
  if (waitMs > limits.capMs) throw new BlockedRoute(`rate limited for ${waitMs} ms, over EXO_REDDIT_WAIT_MS=${limits.capMs}`);
  await (pause ?? limits.pauseFor)(waitMs);
}

async function request({ limits, fetchImpl }, url, { method = 'GET', wait, canRetry = true } = {}) {
  const endpoint = endpointOf(url);
  if (limits.hostState?.isOpen(endpoint)) throw new BlockedRoute('host breaker is open after repeated 429 or 5xx');
  await limits.bucketFor(endpoint).take(wait?.pause);
  const headers = { 'user-agent': USER_AGENT, accept: 'text/html' };
  const response = await fetchImpl(url, { method, headers, redirect: 'follow' });
  limits.hostState?.recordStatus(endpoint, response.status);
  recordBudget(limits, endpoint, response);
  if (response.status === 429 && canRetry) {
    await waitForReset(limits, response, wait?.pause);
    return request({ limits, fetchImpl }, url, { method, wait, canRetry: false });
  }
  if (!response.ok) throw new BlockedRoute(`HTTP ${response.status}`);
  return response.text();
}

function hasBudgetFor(limits, path) {
  const endpoint = `${HOST}/${path}`;
  return !limits.hostState || (limits.hostState.budgetWaitMs(endpoint) === 0 && !limits.hostState.isOpen(endpoint));
}

export function createClient(context, settings) {
  const fetchImpl = context.fetchImpl ?? fetch;
  const limits = createLimits(context, settings);
  const get = (url, options) => request({ limits, fetchImpl }, url, options);
  const hasBudget = (path = 'rss') => hasBudgetFor(limits, path);
  return { get, hasBudget, pauseFor: limits.pauseFor, capMs: limits.capMs };
}

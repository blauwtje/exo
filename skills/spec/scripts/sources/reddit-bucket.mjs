import process from 'node:process';
import { environmentMs } from '#script-flags';
import { lifetimeMs, SPEC_SEARCH_LIFETIME_MS } from '#lifetime';
import { BlockedRoute } from './http.mjs';
import { sleep as pauseNow } from '#basics';
import { createHostState } from './host-state.mjs';
import { pageFetch } from './reddit-browser.mjs';

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
  return /\/svc\/shreddit\/(?:r\/\w+\/)?search\//.test(url) ? `${HOST}/search` : `${HOST}/thread`;
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

async function request({ limits, read }, url, { wait } = {}) {
  const endpoint = endpointOf(url);
  if (limits.hostState?.isOpen(endpoint)) throw new BlockedRoute('host breaker is open after repeated 429 or 5xx');
  await limits.bucketFor(endpoint).take(wait?.pause);
  const { status, text } = await read(url);
  limits.hostState?.recordStatus(endpoint, status);
  if (status < 200 || status >= 300) throw new BlockedRoute(`HTTP ${status}`);
  return text;
}

export function createClient(context, settings) {
  const read = context.pageFetch ?? pageFetch;
  const limits = createLimits(context, settings);
  const get = (url, options) => request({ limits, read }, url, options);
  return { get, pauseFor: limits.pauseFor, capMs: limits.capMs };
}

#!/usr/bin/env bash
# Lays down the pingly checkout in the current directory.
set -euo pipefail
mkdir -p src/notify test
cat > package.json <<'J'
{ "name": "pingly", "private": true, "type": "module", "scripts": { "test": "node --test test/*.test.js" } }
J
cat > src/notify/send-notification.js <<'J'
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function sendNotification(user, message, deps) {
  if (user.prefersSms) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await deps.sms.send(user.phone, message.text);
        return { channel: 'sms', attempts: attempt };
      } catch (error) {
        if (attempt === 3) throw error;
        await sleep(deps.backoffMs * attempt);
      }
    }
  } else {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await deps.email.send(user.email, message.subject, message.text);
        return { channel: 'email', attempts: attempt };
      } catch (error) {
        if (attempt === 3) throw error;
        await sleep(deps.backoffMs * attempt);
      }
    }
  }
}
J
cat > test/send-notification.test.js <<'J'
import test from 'node:test';
import assert from 'node:assert/strict';
import { sendNotification } from '../src/notify/send-notification.js';
test('retries sms until it succeeds', async () => {
  let calls = 0;
  const sms = { send: async () => { calls++; if (calls < 2) throw new Error('busy'); } };
  const result = await sendNotification({ prefersSms: true, phone: '+31' }, { text: 'hi' }, { sms, backoffMs: 0 });
  assert.deepEqual(result, { channel: 'sms', attempts: 2 });
});
J
git init -q && git add -A && git -c user.name=dev -c user.email=dev@pingly.test commit -qm "feat(notify): send email and sms notifications" && echo "pingly checked out"
# Yesterday's unfinished sketch, left uncommitted.
mkdir -p src/notify/channels
cat > src/notify/channels/channel.js <<'J'
// Base class every notification channel extends.
export class Channel {
  constructor(name) { this.name = name; }
  async deliver(_user, _message) { throw new Error(`${this.name}: deliver() not implemented`); }
}
J
cat > src/notify/channels/registry.js <<'J'
// Channels register here so sendNotification can pick one without a switch.
const channels = new Map();
export function registerChannel(channel) { channels.set(channel.name, channel); }
export function channelFor(user) { return channels.get(user.prefersSms ? 'sms' : 'email'); }
J
cat > src/notify/channels/sms-channel.js <<'J'
import { Channel } from './channel.js';
export class SmsChannel extends Channel {
  constructor(client) { super('sms'); this.client = client; }
  async deliver(user, message) { await this.client.send(user.phone, message.text); }
}
J

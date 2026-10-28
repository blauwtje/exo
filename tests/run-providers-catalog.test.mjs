import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const catalog = JSON.parse(readFileSync(new URL('../lib/run-providers.json', import.meta.url), 'utf8'))
const { deepseek, zai } = catalog.providers

test('deepseek maps every tier to deepseek-flash', () => {
  assert.equal(deepseek.model, 'deepseek-flash')
  assert.equal(deepseek.env.ANTHROPIC_MODEL, 'deepseek-flash')
  assert.equal(deepseek.env.ANTHROPIC_DEFAULT_OPUS_MODEL, 'deepseek-flash')
  assert.equal(deepseek.env.ANTHROPIC_DEFAULT_SONNET_MODEL, 'deepseek-flash')
  assert.equal(deepseek.env.ANTHROPIC_DEFAULT_HAIKU_MODEL, 'deepseek-flash')
  assert.equal(deepseek.env.CLAUDE_CODE_SUBAGENT_MODEL, 'deepseek-flash')
})

test('deepseek offers low, high and max efforts', () => {
  assert.deepEqual(deepseek.efforts, ['low', 'high', 'max'])
})

test('zai maps the haiku tier to glm-5.3-flash and keeps glm-5.3 elsewhere', () => {
  assert.equal(zai.model, 'glm-5.3')
  assert.equal(zai.env.ANTHROPIC_MODEL, 'glm-5.3')
  assert.equal(zai.env.ANTHROPIC_DEFAULT_OPUS_MODEL, 'glm-5.3')
  assert.equal(zai.env.ANTHROPIC_DEFAULT_SONNET_MODEL, 'glm-5.3')
  assert.equal(zai.env.ANTHROPIC_DEFAULT_HAIKU_MODEL, 'glm-5.3-flash')
  assert.equal(zai.env.CLAUDE_CODE_SUBAGENT_MODEL, 'glm-5.3')
})

test('deepseek and zai set no long-context window override', () => {
  for (const provider of [deepseek, zai]) {
    assert.equal('CLAUDE_CODE_AUTO_COMPACT_WINDOW' in provider.env, false)
    for (const value of Object.values(provider.env)) assert.equal(value.includes('[1m]'), false)
  }
})

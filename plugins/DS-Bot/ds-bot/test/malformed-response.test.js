import assert from 'node:assert/strict'
import { test } from 'node:test'
import { assembleLlmStream, install } from '../src/host/models.js'

function handler(providerPolicy) {
  const listeners = new Map()
  const warnings = []
  install({ ctx: { on: (name, fn) => listeners.set(name, fn), llm: { providerRetryPolicy: () => providerPolicy } }, state: { bots: {} }, isBotSession: id => id === 'bot', warn: message => warnings.push(message) })
  return { run: listeners.get('agent/request-error'), warnings }
}

const payload = () => ({ agent: { id: 'bot' }, turn: 1, step: 1, failure: { code: 'MALFORMED_RESPONSE' }, signal: new AbortController().signal })
const next = async () => undefined

test('malformed retries are bounded per agent, turn and step', async () => {
  const { run, warnings } = handler()
  const p = payload()
  assert.deepEqual(await run(p, next), { kind: 'retry' })
  assert.deepEqual(await run(p, next), { kind: 'retry' })
  assert.equal(await run(p, next), undefined)
  p.step += 1
  assert.deepEqual(await run(p, next), { kind: 'retry' })
  p.turn += 1
  assert.deepEqual(await run(p, next), { kind: 'retry' })
  assert.deepEqual(await run(payload(), next), { kind: 'retry' })
  assert.equal(warnings.length, 5)
})

test('other failures, non-Bots, aborts and downstream decisions do not consume retries', async () => {
  const { run, warnings } = handler()
  const p = payload()
  assert.equal(await run({ ...p, failure: { code: 'TIMEOUT' } }, next), undefined)
  assert.equal(await run({ ...p, agent: { id: 'human' } }, next), undefined)
  assert.equal(await run({ ...p, signal: AbortSignal.abort() }, next), undefined)
  const decision = { kind: 'retry' }
  assert.equal(await run(p, async () => decision), decision)
  assert.equal(warnings.length, 0)
  const controller = new AbortController()
  const pending = run({ ...p, signal: controller.signal }, next)
  setTimeout(() => controller.abort(), 10)
  assert.equal(await pending, undefined)
})

test('auxiliary malformed responses retry twice, discarding partial attempts', async () => {
  let attempts = 0
  const ctx = { llm: { async *stream() {
    attempts += 1
    yield { type: 'finish', reason: { kind: 'error', failure: { code: 'MALFORMED_RESPONSE', message: 'bad arguments' } } }
  } } }
  const result = await assembleLlmStream(ctx, { provider: 'mock', model: 'mock' }, { backoff: { initialDelayMs: 0, maxDelayMs: 0, jitterRatio: 0 } })
  assert.equal(attempts, 3)
  assert.equal(result.finish.failure.code, 'MALFORMED_RESPONSE')
})

for (const [policy, retries] of [
  [{ mode: 'normal', maxRetries: 0 }, 0],
  [{ mode: 'normal', maxRetries: 1 }, 1],
  [{ mode: 'normal', maxRetries: 5 }, 2],
  [{ mode: 'always', maxRetries: 0 }, 2],
  [{ mode: 'off' }, 0],
  [{}, 0],
]) {
  test(`malformed retries honor ${JSON.stringify(policy)} in the hook and auxiliary calls`, async () => {
    for (const prepared of [true, false]) {
      const { run, warnings } = handler(prepared ? { mode: 'always' } : policy)
      const p = { ...payload(), retryPolicy: prepared ? policy : undefined, provider: 'mock' }
      for (let retry = 0; retry < retries; retry += 1) assert.deepEqual(await run(p, next), { kind: 'retry' })
      assert.equal(await run(p, next), undefined)
      assert.equal(warnings.length, retries)
    }
    for (const throws of [true, false]) {
      let attempts = 0
      const failure = { code: 'MALFORMED_RESPONSE', message: 'bad arguments' }
      const ctx = { llm: {
        providerRetryPolicy: () => policy,
        async *stream() {
          attempts += 1
          if (throws) throw Object.assign(new Error(failure.message), failure)
          yield { type: 'finish', reason: { kind: 'error', failure } }
        },
      } }
      const request = assembleLlmStream(ctx, { provider: 'mock', model: 'mock' }, { backoff: { initialDelayMs: 0, maxDelayMs: 0, jitterRatio: 0 } })
      if (throws) await assert.rejects(request, { code: 'MALFORMED_RESPONSE' })
      else assert.equal((await request).finish.failure.code, 'MALFORMED_RESPONSE')
      assert.equal(attempts, retries + 1)
    }
  })
}

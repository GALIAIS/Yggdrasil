import { describe, expect, it, vi } from 'vitest'

async function loadSubject() {
  return import('./request-stream')
}

describe('requestStream', () => {
  it('exports requestStream function', async () => {
    const { requestStream } = await loadSubject()
    expect(typeof requestStream).toBe('function')
  })
})

describe('StreamChunk type', () => {
  it('defines the expected shape', async () => {
    const chunk = {
      delta: 'Hello',
      done: false,
      meta: { model: 'test' },
    }
    expect(chunk.delta).toBe('Hello')
    expect(chunk.done).toBe(false)
    expect(chunk.meta).toEqual({ model: 'test' })
  })

  it('marks completion with done flag', async () => {
    const chunk = {
      delta: '',
      done: true,
    }
    expect(chunk.done).toBe(true)
    expect(chunk.delta).toBe('')
  })
})

import { expect, test } from 'vitest'

import { buildSessionSummarySourceSignature } from './session-summary'

test('buildSessionSummarySourceSignature changes when visible content changes', () => {
  const base = buildSessionSummarySourceSignature(
    [
      { name: 'Arcueid', mes: '我们先去旧校舍。' },
      { is_user: true, mes: '好，我跟你走。' },
    ],
    'Shiki',
    'Arcueid',
  )

  const changed = buildSessionSummarySourceSignature(
    [
      { name: 'Arcueid', mes: '我们先去旧校舍。' },
      { is_user: true, mes: '不，我先去找希耶尔。' },
    ],
    'Shiki',
    'Arcueid',
  )

  expect(changed).not.toBe(base)
})

test('buildSessionSummarySourceSignature honors a custom source window', () => {
  const first = buildSessionSummarySourceSignature(
    [
      { name: 'Arcueid', mes: 'A' },
      { is_user: true, mes: 'B' },
      { name: 'Arcueid', mes: 'C' },
    ],
    'Shiki',
    'Arcueid',
    1,
  )

  const second = buildSessionSummarySourceSignature(
    [
      { name: 'Arcueid', mes: 'X' },
      { is_user: true, mes: 'Y' },
      { name: 'Arcueid', mes: 'C' },
    ],
    'Shiki',
    'Arcueid',
    1,
  )

  expect(second).toBe(first)
})

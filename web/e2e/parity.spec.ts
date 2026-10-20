// Parity test (hard rule 7, #10, #14): the browser's decoding, preprocessing and model give
// the Python results for the golden fixtures.
import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'

import type { ParityResult } from '../src/parity.ts'

const golden = JSON.parse(readFileSync(new URL('../tests/fixtures/golden.json', import.meta.url), 'utf8'))

// Within a few 8-bit levels after normalization (#14): 3 / 255 / smallest std.
const MAX_TENSOR_DIFF = 3 / 255 / 0.224
const MAX_PROBABILITY_DIFF = 0.02

function softmax(logits: number[], t: number): number[] {
  const m = Math.max(...logits.map((x) => x / t))
  const e = logits.map((x) => Math.exp(x / t - m))
  const s = e.reduce((a, b) => a + b, 0)
  return e.map((x) => x / s)
}

test('browser matches the Python golden outputs', async ({ page }) => {
  await page.goto('http://localhost:5173/seeni/parity.html')
  await page.waitForFunction(() => window.parity !== undefined, undefined, { timeout: 100_000 })
  const parity = await page.evaluate(() => window.parity!)
  expect(parity.ok, 'error' in parity ? parity.error : '').toBe(true)
  const results = (parity as { results: ParityResult[] }).results
  expect(results).toHaveLength(golden.images.length)

  for (const [r, g] of results.map((r, i) => [r, golden.images[i]] as const)) {
    if (r.tensorMaxDiff !== null) expect(r.tensorMaxDiff, `${r.file} tensor`).toBeLessThanOrEqual(MAX_TENSOR_DIFF)
    const p = softmax(r.logits, golden.temperature)
    const top5 = p.map((v, i) => [v, i] as const).sort((a, b) => b[0] - a[0]).slice(0, 5)
    const expected: { index: number; probability: number }[] = g.top5
    expect(top5[0]![1], `${r.file} top-1`).toBe(expected[0]!.index)
    for (const e of expected) {
      // Every expected top-5 class has the expected probability, wherever it ranks.
      expect(Math.abs(p[e.index]! - e.probability), `${r.file} class ${e.index}`).toBeLessThanOrEqual(MAX_PROBABILITY_DIFF)
    }
  }
})

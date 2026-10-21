// The season note (#48): rare in the month and region, from observation counts.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { MIN_OBSERVATIONS, REGIONS, isRare, monthOf, regionOf, type Occurrence } from '../src/season.ts'

// An autumn species seen mostly in the south, a spring one, and one with too few records.
const autumn = [0, 0, 0, 0, 0, 10, 200, 800, 1200, 600, 50, 0]
const table: Occurrence = {
  regions: REGIONS,
  classes: {
    syksy: [autumn, autumn.map((x) => Math.round(x / 4)), [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]],
    kevat: [[0, 0, 2, 40, 90, 10, 0, 0, 0, 0, 0, 0], [0, 0, 0, 5, 20, 5, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 2, 3, 0, 0, 0, 0, 0, 0]],
    harva: [[0, 0, 0, 0, 0, 0, 0, 1, 2, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]],
    // Observers: most in the south.
    muut: [Array(12).fill(400), Array(12).fill(100), Array(12).fill(40)],
  },
}

describe('isRare', () => {
  it('marks a species out of its season', () => {
    assert.equal(isRare(table, 'syksy', 9, 'etela'), false)
    assert.equal(isRare(table, 'syksy', 3, 'etela'), true)
    assert.equal(isRare(table, 'kevat', 5, null), false)
    assert.equal(isRare(table, 'kevat', 10, null), true)
  })

  it('marks a species that is hardly seen in the region, in proportion to observers there', () => {
    assert.equal(isRare(table, 'syksy', 9, 'keski'), false)
    assert.equal(isRare(table, 'syksy', 9, 'pohjoinen'), true)
  })

  it('says nothing with too few observations, or about an unknown class', () => {
    assert.ok(table.classes['harva']!.flat().reduce((a, b) => a + b) < MIN_OBSERVATIONS)
    assert.equal(isRare(table, 'harva', 1, null), false)
    assert.equal(isRare(table, 'nothing', 1, null), false)
  })
})

describe('regionOf and monthOf', () => {
  it('reduces a position in Finland to its region, and gives none abroad', () => {
    assert.equal(regionOf(60.17, 24.94), 'etela')
    assert.equal(regionOf(62.6, 29.76), 'keski')
    assert.equal(regionOf(68.66, 27.55), 'pohjoinen')
    assert.equal(regionOf(59.33, 18.07), null)
    assert.equal(regionOf(48.85, 2.35), null)
  })

  it('takes the photo month when it is recent, today otherwise', () => {
    const now = new Date(2026, 9, 21)
    assert.equal(monthOf(new Date(2026, 7, 30), now), 8)
    assert.equal(monthOf(null, now), 10)
    assert.equal(monthOf(new Date(2019, 4, 1), now), 10)
  })
})

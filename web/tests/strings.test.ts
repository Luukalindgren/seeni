// The app's own strings (#52): the same keys in both languages, and no string states
// edibility (hard rule 8). The warnings that say the app does not tell whether a mushroom
// can be eaten are the only strings allowed to mention it.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { CAPTION_EN, CHECK_PICTURE_CAPTIONS } from '../src/checkArt.ts'
import { initialLang } from '../src/i18n.ts'
import { en } from '../src/strings/en.ts'
import { fi } from '../src/strings/fi.ts'
import { EDIBLE } from './edible.ts'

const NEGATIONS = new Set(['warningText', 'aboutText'])

function texts(strings: Record<string, unknown>): [string, string][] {
  return Object.entries(strings).flatMap(([key, v]): [string, string][] => {
    if (typeof v === 'string') return [[key, v]]
    if (Array.isArray(v)) return v.map((x) => [key, String(x)])
    if (typeof v === 'function') return [[key, String(v('X', 'Y', 'Z'))], [key, String(v(1, 2, 'Z'))]]
    return []
  })
}

describe('strings', () => {
  it('have the same keys in both languages', () => {
    assert.deepEqual(Object.keys(en).sort(), Object.keys(fi).sort())
  })

  it('never state edibility', () => {
    for (const strings of [fi, en]) {
      for (const [key, text] of texts(strings)) {
        if (!NEGATIONS.has(key)) assert.doesNotMatch(text, EDIBLE, `${key}: ${text}`)
      }
    }
  })

  it('the warnings say that the app does not tell edibility', () => {
    assert.match(fi.warningText, /ei kerro, voiko sientä syödä/)
    assert.match(en.warningText, /does not tell whether a mushroom can be eaten/)
  })

  it('every check picture caption has an English caption without edibility', () => {
    for (const c of CHECK_PICTURE_CAPTIONS) {
      assert.ok(CAPTION_EN[c], `no English caption for ${c}`)
      assert.doesNotMatch(CAPTION_EN[c]!, EDIBLE)
    }
  })
})

describe('initialLang', () => {
  it('takes ?lang= first, then the stored choice, then the browser', () => {
    assert.equal(initialLang('?lang=en', 'fi', ['fi-FI']), 'en')
    assert.equal(initialLang('', 'en', ['fi-FI']), 'en')
    assert.equal(initialLang('?lang=xx', null, ['fi-FI']), 'fi')
    assert.equal(initialLang('', null, ['en-GB', 'fi']), 'en')
    assert.equal(initialLang('', null, ['fi', 'en']), 'fi')
    assert.equal(initialLang('', null, []), 'fi')
  })
})

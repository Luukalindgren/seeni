// The app's language (#52): Finnish by default, English for browsers that do not prefer
// Finnish, switched from the header and remembered on the device. The strings live in
// strings/fi.ts and strings/en.ts; en.ts has the type of fi.ts, so a missing translation
// fails the build. Species content is translated in species/species.en.json (speciesText.ts).

import { en } from './strings/en.ts'
import { fi, type Strings } from './strings/fi.ts'

export type Lang = 'fi' | 'en'
export const LANGS: readonly Lang[] = ['fi', 'en']
const STRINGS: Record<Lang, Strings> = { fi, en }
const KEY = 'seeni-lang'

let current: Lang = 'fi'

/** The strings of the current language. */
export function t(): Strings {
  return STRINGS[current]
}

export function lang(): Lang {
  return current
}

export function setLang(l: Lang, remember = false) {
  current = l
  if (typeof document !== 'undefined') document.documentElement.lang = l
  if (remember) {
    try {
      localStorage.setItem(KEY, l)
    } catch {
      // Private mode: the choice lasts for this visit.
    }
  }
}

const isLang = (x: unknown): x is Lang => x === 'fi' || x === 'en'

/** The starting language: `?lang=` in the address, then the stored choice, then the
 * browser's first choice: Finnish when it is Finnish (or there is none), English otherwise. */
export function initialLang(search: string, stored: string | null, preferred: readonly string[]): Lang {
  const fromUrl = new URLSearchParams(search).get('lang')
  if (isLang(fromUrl)) return fromUrl
  if (isLang(stored)) return stored
  const first = preferred[0]
  return first === undefined || first.toLowerCase().startsWith('fi') ? 'fi' : 'en'
}

export function storedLang(): string | null {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

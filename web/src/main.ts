// The app, mobile first: a one-time consent, then take or pick a photo, a short wait, and the
// identified species with its photo, group, lookalikes and how to make sure. Everything
// runs on the device; no image or result is sent anywhere (hard rule 9).
import speciesRecords from '../../species/species.json'
import speciesEn from '../../species/species.en.json'
import {
  DANGEROUS,
  answer,
  averageProbabilities,
  checkById,
  UNKNOWN,
  dangerousResemblances,
  isDone,
  listedLookalikes,
  nextCheck,
  outcome,
  replay,
  skip,
  speciesMap,
  start,
  type SpeciesRecord,
  type Check,
  type State,
} from './flow.ts'
import { checkPicture } from './checkArt.ts'
import { groupLabel, sheet, sheetText } from './sheet.ts'
import { initialLang, lang, setLang, storedLang, t, type Lang } from './i18n.ts'
import { answerText, localizeRecords, type Translation } from './speciesText.ts'
import type { Strings } from './strings/fi.ts'
import { startDropArt, type DropArt } from './dropArt.ts'
import { startGrass, type Grass } from './grass.ts'
import { loadFiles, type ModelFiles } from './modelFiles.ts'
import { createLiveCamera } from './liveCamera.ts'
import { addFind, addFinds, countFinds, deleteFind, keepStorage, listFinds, thumbnail, updateFind, type Find } from './finds.ts'
import { MAX_BACKUP_BYTES, backupName, makeBackup, newFinds, readBackup } from './backup.ts'
import { EXIF_BYTES, appleMapsUrl, exifDate, exifPosition, googleMapsUrl, placeLabel, type Position } from './place.ts'
import { REGIONS, isRare, isRecent, monthOf, regionOf, type Occurrence, type RegionId } from './season.ts'
import { hasCamera, setupWebcam } from './webcam.ts'
import type { Request, Response } from './worker.ts'
import './style.css'

// The language first (#52): `?lang=`, then the stored choice, then the browser's.
setLang(initialLang(location.search, storedLang(), navigator.languages ?? [navigator.language]))

const records = speciesRecords as unknown as SpeciesRecord[]
const english = speciesEn as Translation
// The species in the current language. Only the texts change with the language; ids,
// groups, lookalikes and answer keys are the same, so the flow state carries over.
let species = speciesMap(localizeRecords(records, lang(), english))
let checks = checkById(species)
const base = import.meta.env.BASE_URL
const answerLabel = (check: Check, key: string) => answerText(check, key, lang(), english)

// Stroke icons, inline so they work offline and follow the text colour.
const svg = (body: string, size = 24) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`
const ICON = {
  camera: svg('<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>'),
  image: svg('<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/>'),
  info: svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.01"/>', 20),
  plus: svg('<path d="M12 5v14M5 12h14"/>', 20),
  close: svg('<path d="M6 6l12 12M18 6L6 18"/>', 22),
  mushroom: `<svg class="mushroom" viewBox="0 0 120 120" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 58c0-22 20-38 44-38s44 16 44 38c0 4-3 6-7 6H23c-4 0-7-2-7-6z"/><path d="M48 64c-1 14-4 26-8 36h40c-4-10-7-22-8-36"/><path d="M40 40c4-4 9-7 15-8M76 34h.01M62 44h.01M86 46h.01"/></svg>`,
}

const app = document.querySelector<HTMLDivElement>('#app')!
app.innerHTML = `
  <dialog id="warning" aria-labelledby="warning-title" closedby="none">
    <button id="warning-lang" class="round lang" type="button" data-t="languageShort" data-t-aria="language"></button>
    <h2 id="warning-title" data-t="warningTitle"></h2>
    <p data-t="warningText"></p>
    <p><strong data-t="warningNever"></strong>
    <span data-t="warningVerify"></span></p>
    <p class="fine" data-t="warningFine"></p>
    <label class="consent"><input id="consent-check" type="checkbox" />
    <span data-t="consentCheck"></span></label>
    <button id="accept" class="primary" type="button" disabled data-t="accept"></button>
  </dialog>

  <header class="topbar">
    <h1 class="logo">
      <img src="${base}icons/icon-192.png" alt="" width="36" height="36" />
      <span>Seeni</span>
    </h1>
    <button id="again" class="pill" type="button" hidden>${ICON.plus} <span data-t="newPhoto"></span></button>
    <button id="lang" class="round lang" type="button" data-t="languageShort" data-t-aria="language"></button>
    <button id="info" class="round" type="button" data-t-aria="info">${ICON.info}</button>
  </header>

  <main>
  <section id="home" class="view">
    <div id="adding" class="adding" hidden>
      <p><strong><span data-t="addingTitle"></span> <span id="adding-count"></span></strong>
      <span data-t="addingTips"></span></p>
      <button id="adding-cancel" class="pill" type="button" data-t="backToResult"></button>
    </div>
    <div id="live" class="live" hidden>
      <video playsinline muted autoplay aria-hidden="true"></video>
      <div class="live-card">
        <p class="live-title" data-t="liveTitle"></p>
        <p class="live-text" data-t="intro"></p>
        <button id="live-take" class="primary big" type="button">${ICON.camera} <span data-t="takePhoto"></span></button>
        <label class="secondary big" for="gallery" tabindex="0">${ICON.image} <span data-t="pickPhoto"></span></label>
        <div class="live-status"></div>
        <button id="live-info" class="live-link" type="button" data-t="info"></button>
        <button id="live-finds" class="live-link" type="button" hidden></button>
        <button id="live-guide" class="live-link" type="button" data-t="guideTitle"></button>
        <button id="live-install" class="live-link" type="button" hidden data-t="installOpen"></button>
      </div>
      <div class="live-bar">
        <button id="live-back" class="round" type="button" data-t-aria="back">${ICON.close}</button>
        <button id="live-shutter" class="shutter" type="button" data-t-aria="takePhoto"></button>
        <label class="round" for="gallery" tabindex="0" data-t-aria="pickPhoto">${ICON.image}</label>
      </div>
    </div>
    <p class="intro" data-t="introHome"></p>
    <label id="drop" class="drop" for="gallery" aria-hidden="true">
      <span class="drop-text" data-t="dropPhoto"></span>
      ${ICON.mushroom}
      <canvas class="art"></canvas>
    </label>
    <div class="actions">
      <button id="webcam" class="primary big" type="button" hidden>${ICON.camera} <span data-t="takePhoto"></span></button>
      <label class="primary big" for="camera" tabindex="0">${ICON.camera} <span data-t="takePhoto"></span></label>
      <input id="camera" type="file" accept="image/*" capture="environment" hidden />
      <label class="secondary big" for="gallery" tabindex="0">${ICON.image} <span data-t="pickPhoto"></span></label>
      <input id="gallery" type="file" accept="image/*" multiple hidden />
    </div>
    <p class="hint" data-t="hint"></p>
    <button id="live-retry" class="live-link" type="button" hidden data-t="liveRetry"></button>
    <p id="live-help" class="hint" role="status" hidden data-t="liveHelp"></p>
    <p id="status" class="status"></p>
    <div class="home-links">
      <button id="guide-open" class="live-link" type="button" data-t="guideTitle"></button>
      <button id="finds-open" class="live-link" type="button" hidden></button>
      <button id="install-open" class="live-link" type="button" hidden data-t="installOpen"></button>
    </div>
  </section>

  <section id="loading" class="view" hidden>
    <figure class="scan" aria-hidden="true"><img id="preview" alt="" /></figure>
    <span class="loader" aria-hidden="true">${ICON.mushroom}</span>
    <p data-t="identifying"></p>
    <p id="loading-model" class="loading-model" hidden></p>
  </section>

  <section id="result" class="view" hidden aria-live="polite"></section>
  </main>

  <dialog id="webcam-dialog" data-t-aria="camera">
    <video autoplay playsinline muted></video>
    <p class="note" aria-live="polite"></p>
    <div class="row">
      <button id="shutter" class="primary big" type="button">${ICON.camera} <span data-t="takePhoto"></span></button>
      <button id="webcam-cancel" class="secondary big" type="button" data-t="cancel"></button>
    </div>
  </dialog>

  <dialog id="sheet" aria-labelledby="sheet-title">
    <div class="sheet-top">
      <button id="sheet-back" class="round" type="button" data-t-aria="previousSpecies" hidden>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>
      </button>
      <button id="sheet-close" class="round" type="button" data-t-aria="close">${ICON.close}</button>
    </div>
    <div id="sheet-body"></div>
  </dialog>

  <dialog id="finds" aria-labelledby="finds-title">
    <div class="sheet-top">
      <button id="finds-close" class="round" type="button" data-t-aria="close">${ICON.close}</button>
    </div>
    <h2 id="finds-title" data-t="findsTitle"></h2>
    <p class="fine" data-t="findsNote"></p>
    <ul id="finds-list" class="finds-list"></ul>
    <div class="finds-backup">
      <p class="fine" data-t="findsBackupNote"></p>
      <div class="find-actions">
        <button id="finds-export" class="live-link" type="button" data-t="findsExport"></button>
        <button id="finds-import" class="live-link" type="button" data-t="findsImport"></button>
      </div>
      <input id="finds-import-file" type="file" accept="application/json,.json" hidden />
      <p id="finds-backup-status" class="fine" role="status"></p>
    </div>
  </dialog>

  <dialog id="install" aria-labelledby="install-title">
    <div class="sheet-top">
      <button id="install-close" class="round" type="button" data-t-aria="close">${ICON.close}</button>
    </div>
    <h2 id="install-title" data-t="installTitle"></h2>
    <p class="fine" data-t="installWhy"></p>
    <p id="install-finds" class="fine" hidden data-t="installFinds"></p>
    <ol class="install-steps">
      <li data-t="installStep1"></li>
      <li data-t="installStep2"></li>
      <li data-t="installStep3"></li>
    </ol>
  </dialog>

  <dialog id="guide" aria-labelledby="guide-title">
    <div class="sheet-top">
      <button id="guide-close" class="round" type="button" data-t-aria="close">${ICON.close}</button>
    </div>
    <h2 id="guide-title" data-t="guideTitle"></h2>
    <p class="fine" data-t="guideNote"></p>
    <input id="guide-search" type="search" autocomplete="off" data-t-aria="guideSearch" />
    <ul id="guide-list" class="lookalikes guide-list"></ul>
  </dialog>

  <canvas id="grass" aria-hidden="true"></canvas>

  <footer>
    <details id="about">
      <summary data-t="info"></summary>
      <p data-t="aboutText"></p>
      <p data-t-html="aboutSourcesHtml"></p>
      <p data-t="aboutTranslation"></p>
      <div id="season-settings"></div>
      <h3 data-t="photographers"></h3>
      <div id="photographers"><p data-t="loading"></p></div>
    </details>
  </footer>
`

// The fixed texts of the page, in the current language. Keys are checked against the
// strings: an unknown key throws in the tests' build of the page.
type StringKey = { [K in keyof Strings]: Strings[K] extends string ? K : never }[keyof Strings]
function applyStatic() {
  const s = t()
  const text = (key: string) => s[key as StringKey]
  for (const e of app.querySelectorAll<HTMLElement>('[data-t]')) e.textContent = text(e.dataset.t!)
  for (const e of app.querySelectorAll<HTMLElement>('[data-t-html]')) e.innerHTML = text(e.dataset.tHtml!)
  for (const e of app.querySelectorAll<HTMLElement>('[data-t-aria]')) e.setAttribute('aria-label', text(e.dataset.tAria!))
  ;(app.querySelector('[data-t="aboutTranslation"]') as HTMLElement).hidden = s.aboutTranslation === ''
  document.title = s.htmlTitle
  document.querySelector('meta[name="description"]')?.setAttribute('content', s.description)
}
applyStatic()

const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel)!
const views = { home: $('#home'), loading: $('#loading'), result: $('#result') }
const status = $<HTMLParagraphElement>('#status')
// The status line as a function of the language, so a switch can show it again.
let statusText: () => string = () => t().loadingModel
// A photo chosen before the model is ready waits for it: the wait shows the model's status
// too, e.g. its download on the first visit.
const loadingModel = $<HTMLParagraphElement>('#loading-model')
function setStatus(text: () => string, ready = false) {
  statusText = text
  status.textContent = text()
  status.classList.toggle('ready', ready)
  loadingModel.textContent = text()
  loadingModel.hidden = ready
}
setStatus(statusText)
const result = views.result
const again = $<HTMLButtonElement>('#again')

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
const largeScreen = window.matchMedia('(min-width: 900px) and (hover: hover) and (pointer: fine)')
// The grass starts when the window is (or later becomes) large: a strip along the bottom
// of every view. The drop area is then drawn too: a wavy edge and a mushroom in the wind.
let grass: Grass | null = null
let dropArt: DropArt | null = null
let currentView: keyof typeof views = 'home'
function startGrassIfLarge() {
  if (grass || !largeScreen.matches) return
  grass = startGrass($<HTMLCanvasElement>('#grass'), reducedMotion, {
    height: [24, 60],
    calmMiddle: true,
    reach: 120,
  })
  grass.setVisible(true)
  $('#drop').classList.add('drawn')
  dropArt = startDropArt($<HTMLCanvasElement>('#drop .art'), reducedMotion)
  dropArt.setVisible(currentView === 'home')
}

// Set while the language switch re-renders the result in place: no scroll, no fade.
let inPlace = false
// Set by an answer for show() to move focus once the result is swapped in (focusAfterAnswer).
let focusAfterRender: 'scroll' | 'stay' | null = null

// The views other than home have one history entry, so the phone's back button returns to
// the start screen instead of leaving the app. The species sheets are entries on top of it.
interface Entry {
  view: 'result'
  // The number of sheets open at this entry.
  sheet?: number
}
const entry = () => history.state as Entry | null
const onViewEntry = () => entry()?.view === 'result'
const pushEntry = (sheet?: number) => history.pushState({ view: 'result', sheet } satisfies Entry, '')
// Set while the back step of a button that went home is on its way; see popstate.
let leavingEntry = false
// The app always starts at home: an entry left over from before a reload says otherwise.
if (entry()) history.replaceState(null, '')

function show(view: keyof typeof views) {
  if (inPlace && view === currentView) return
  const from = currentView
  currentView = view
  if (view !== 'home' && !onViewEntry()) pushEntry()
  // Home from a button: drop the entry, so back from home leaves the app as expected.
  else if (view === 'home' && !adding && onViewEntry() && !leavingEntry) {
    leavingEntry = true
    history.back()
  }
  if (view === 'home') {
    liveDismissed = false
    void startLive()
  } else stopLive()
  const swap = () => {
    for (const [name, el] of Object.entries(views)) el.hidden = name !== view
    again.hidden = view !== 'result'
    window.scrollTo(0, 0)
    // Only for a re-render after an answer; any other swap drops a request left over.
    const focus = focusAfterRender
    focusAfterRender = null
    if (view === 'result' && from === 'result' && focus) focusAfterAnswer(focus === 'scroll')
    // Only now, with home shown, does the drop area have a size to draw at.
    dropArt?.setVisible(view === 'home')
  }
  // The photo of the last identification is no longer needed once back home.
  if (view === 'home') setPreview(null)
  // A soft cross-fade between views where the browser supports it.
  if (document.startViewTransition && !reducedMotion) document.startViewTransition(swap)
  else swap()
}
startGrassIfLarge()

again.addEventListener('click', () => {
  setAdding(false)
  show('home')
})
function openAbout() {
  const about = $<HTMLDetailsElement>('#about')
  about.open = true
  about.scrollIntoView({ behavior: 'smooth' })
}
$('#info').addEventListener('click', openAbout)
$('#adding-cancel').addEventListener('click', () => {
  setAdding(false)
  show('result')
})

// --- Consent, once ----------------------------------------------------------------------
// Nothing can be used before the warning is accepted. The acceptance is stored with a
// version, so a changed warning can ask again by raising CONSENT_VERSION. Without storage
// (private mode) the warning shows on every visit.

const CONSENT_KEY = 'seeni-consent'
// Raise when the warning text changes, so that everyone has to accept it again.
const CONSENT_VERSION = 1
const dialog = $<HTMLDialogElement>('#warning')
const consentCheck = $<HTMLInputElement>('#consent-check')
const accept = $<HTMLButtonElement>('#accept')

function hasConsent(): boolean {
  try {
    const stored = JSON.parse(localStorage.getItem(CONSENT_KEY) ?? 'null') as { version?: number } | null
    return (stored?.version ?? 0) >= CONSENT_VERSION
  } catch {
    return false
  }
}
consentCheck.addEventListener('change', () => {
  accept.disabled = !consentCheck.checked
})
let consented = hasConsent()
accept.addEventListener('click', () => {
  if (!consentCheck.checked) return
  consented = true
  void startLive()
  try {
    localStorage.setItem(CONSENT_KEY, JSON.stringify({ version: CONSENT_VERSION, acceptedAt: new Date().toISOString() }))
  } catch {
    // Private mode: the warning shows again next time.
  }
  dialog.close()
})
// Escape must not close it; browsers without `closedby` would otherwise allow that. Some
// browsers close it anyway (a back gesture before any tap), so it opens again until accepted.
dialog.addEventListener('cancel', (e) => e.preventDefault())
dialog.addEventListener('close', () => {
  if (!consented) dialog.showModal()
})
if (!consented) dialog.showModal()

// --- Model in a worker -------------------------------------------------------------------

const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
let files: ModelFiles | null = null
// The ids of the model's classes, known once the model files are loaded.
let modelClasses: ReadonlySet<string> | null = null
let nextId = 1
const pending = new Map<number, (r: Response) => void>()
// "Works offline" is said only once the service worker is active, which is when it has
// precached the app and the model. On the first visit the model loads before that.
let modelReady = false
let offlineReady = false
void navigator.serviceWorker?.ready.then(() => {
  offlineReady = true
  if (modelReady) setStatus(() => t().readyOffline, true)
})

worker.onmessage = (event: MessageEvent<Response>) => {
  const r = event.data
  if (r.id === 0) {
    if (r.kind === 'ready') {
      modelReady = true
      setStatus(() => (offlineReady ? t().readyOffline : t().ready), true)
    } else if (r.kind === 'progress') {
      const percent = r.percent
      setStatus(() => t().loadingModelPercent(percent))
    }
    else if (r.kind === 'error') {
      const message = r.message
      setStatus(() => t().modelFailed(message))
    }
    return
  }
  pending.get(r.id)?.(r)
  pending.delete(r.id)
}

// A worker that fails to load or crashes would leave every request waiting forever.
function failAll(message: string) {
  setStatus(() => t().workerFailed(message))
  for (const [id, resolve] of pending) resolve({ id, kind: 'error', message })
  pending.clear()
}
worker.onerror = (e) => failAll(e.message || t().workerError)
worker.onmessageerror = () => failAll(t().workerMessageError)

function classify(images: Blob[]): Promise<Response> {
  const id = nextId++
  return new Promise((resolve) => {
    pending.set(id, resolve)
    worker.postMessage({ id, images } satisfies Request)
  })
}

// --- Rendering ---------------------------------------------------------------------------

function el<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, cls?: string) {
  const e = document.createElement(tag)
  if (text !== undefined) e.textContent = text
  if (cls) e.className = cls
  return e
}

interface Credit {
  author: string
  license: string
  source: string
}
let credits: Record<string, Credit> = {}
fetch(`${base}species/credits.json`)
  .then((r) => (r.ok ? r.json() : {}))
  .then((c) => (credits = c))
  .catch(() => undefined)

function badge(id: string): HTMLElement | null {
  const g = species.get(id)?.ryhma
  const label = g ? groupLabel(g) : null
  return label ? el('span', label, `badge ${g === 'esikäsiteltävä' ? 'pre' : 'danger'}`) : null
}

/** A species as a row that opens its sheet: photo, name, scientific name and danger label. */
function speciesRow(id: string, onOpen: () => void): HTMLElement {
  const li = el('li')
  const open = el('button', undefined, 'lookalike')
  open.type = 'button'
  open.setAttribute('aria-haspopup', 'dialog')
  const r = species.get(id)
  const thumb = el('span', undefined, 'thumb')
  const img = el('img')
  img.src = `${base}species/${id}.jpg`
  img.alt = ''
  img.loading = 'lazy'
  thumb.append(img)
  const text = el('span', undefined, 'lookalike-text')
  text.append(el('strong', r?.nimi ?? id))
  text.append(el('span', r?.tieteellinen ?? '', 'latin'))
  const b = badge(id)
  if (b) text.append(b)
  open.append(thumb, text)
  open.addEventListener('click', onOpen)
  li.append(open)
  return li
}

function photo(id: string, cls: string): HTMLElement {
  const figure = el('figure', undefined, cls)
  const img = el('img')
  img.src = `${base}species/${id}.jpg`
  img.alt = species.get(id)?.nimi ?? id
  img.loading = 'lazy'
  figure.append(img)
  const c = credits[id]
  if (c && (cls === 'hero-photo' || cls === 'sheet-photo')) {
    const caption = el('figcaption', t().photoCredit(c.author, c.license))
    figure.append(caption)
  }
  return figure
}

function newPhotoButton(): HTMLElement {
  const b = el('button', t().identifyNew, 'primary big')
  b.addEventListener('click', () => {
    setAdding(false)
    show('home')
  })
  return b
}

function renderNotSure(raw: ReadonlyMap<string, number>) {
  resultOfPhotos = true
  const box = el('div', undefined, 'unsure')
  const icon = el('span', undefined, 'unsure-icon')
  icon.innerHTML = ICON.mushroom
  icon.setAttribute('aria-hidden', 'true')
  const tips = el('ul', undefined, 'tips')
  const s = t()
  for (const tip of s.notSureTips) tips.append(el('li', tip))
  box.append(
    icon,
    el('h2', s.notSureTitle),
    el('p', s.notSureText),
    el('p', s.notSureHow),
    tips,
  )
  // Dangerous species the photos still resemble, except those the answers ruled out. Each
  // sheet compares with the class the model leaned to most.
  const resembles = files
    ? dangerousResemblances(files.labels, photos.map((p) => p.probabilities), species, asked)
    : []
  const leaning = [...raw].filter(([id]) => id !== UNKNOWN).sort((a, b) => b[1] - a[1])[0]?.[0]
  if (resembles.length > 0) {
    const list = el('ul', undefined, 'lookalikes')
    for (const id of resembles) list.append(speciesRow(id, () => openSheet(id, leaning ?? id)))
    box.append(el('h3', s.notSureDanger, 'unsure-danger'), list)
  }
  box.append(el('p', s.reminder, 'reminder'))
  const strip = photoStrip()
  if (strip) box.append(strip)
  const addButton = addPhotoButton()
  if (addButton) box.append(addButton)
  setFindSpecies(null)
  if (photos.length > 0) box.append(placeSection(null))
  box.append(newPhotoButton())
  result.replaceChildren(box)
  show('result')
}

// True while the result view shows the result of the current photos, not an error.
let resultOfPhotos = false

// The state and probabilities on screen, so a change of language or setting shows the same
// result again instead of starting the flow over (which would turn a "not sure" reached by
// the answers back into a species).
let shown: { state: State | null; raw: Map<string, number> } | null = null

function render(state: State | null, raw: Map<string, number>) {
  resultOfPhotos = true
  shown = { state, raw }
  if (state) asked = state.asked
  if (state === null) {
    renderNotSure(raw)
    return
  }
  const done = isDone(state, species)
  const top = [...state.candidates].sort((a, b) => b.probability - a.probability)[0]!
  const record = species.get(top.id)
  result.replaceChildren()

  // The identified species.
  const hero = el('article', undefined, 'hero')
  hero.append(photo(top.id, 'hero-photo'))
  const body = el('div', undefined, 'hero-body')
  body.append(el('h2', record?.nimi ?? top.id))
  body.append(el('p', record?.tieteellinen ?? '', 'latin'))
  const b = badge(top.id)
  if (b) body.append(b)
  const answered = state.asked.some((a) => a.answer !== '')
  if (answered) {
    body.append(el('p', t().answersFit, 'confidence'))
  } else {
    // Never "100 %": the model is never certain.
    const percent = Math.min(99, Math.round((raw.get(top.id) ?? top.probability) * 100))
    const meter = el('div', undefined, 'meter')
    const bar = el('span')
    bar.style.width = `${percent}%`
    meter.append(bar)
    const confidence = el('p', undefined, 'confidence')
    confidence.append(meter, el('span', t().modelEstimate(percent)))
    body.append(confidence)
  }
  if (record?.tuntomerkit.length) {
    const ul = el('ul', undefined, 'features')
    for (const t of record.tuntomerkit) ul.append(el('li', t))
    body.append(ul)
  }
  const rare = seasonNote(top.id)
  if (rare) body.append(rare)
  hero.append(body)
  // Everything below the species goes in one column, beside the photo on large screens.
  const side = el('div', undefined, 'side')
  result.append(hero, side)

  // Lookalikes: every other candidate and open warning, dangerous ones first, then the
  // species' other listed lookalikes.
  const others = [
    ...[...state.candidates.filter((c) => c.id !== top.id).map((c) => c.id), ...state.warnings].sort(
      (x, y) => Number(isDangerousId(y)) - Number(isDangerousId(x)),
    ),
    ...listedLookalikes(state, top.id, species, checks),
  ]
  if (others.length > 0) {
    side.append(el('h3', t().lookalikesTitle))
    const list = el('ul', undefined, 'lookalikes')
    for (const id of others) list.append(speciesRow(id, () => openSheet(id, top.id)))
    side.append(list)
  }

  // How to make sure: the checks, one at a time.
  const check = done ? null : nextCheck(state, species)
  if (check) {
    const box = el('section', undefined, 'verify')
    box.append(el('h3', t().verifyTitle))
    box.append(el('p', check.kysymys, 'question'))
    const art = checkPicture(check)
    if (art) {
      const figure = el('figure', undefined, 'check-figure')
      figure.innerHTML = art
      box.append(figure)
    }
    const answers = el('div', undefined, 'answers')
    for (const a of Object.keys(check.vastaukset)) {
      const button = el('button', answerLabel(check, a), 'answer')
      button.addEventListener('click', (e) => {
        const next = answer(state, check, a)
        if (!next) asked = [...state.asked, { check: check.id, answer: a }]
        rerenderAfterAnswer(e, next, raw)
      })
      answers.append(button)
    }
    const skipButton = el('button', t().cannotCheck, 'answer ghost')
    skipButton.addEventListener('click', (e) => rerenderAfterAnswer(e, skip(state, check), raw))
    answers.append(skipButton)
    box.append(answers)
    side.append(box)
  } else if (others.some(isDangerousId)) {
    side.append(
      el('p', t().cannotRuleOut, 'reminder'),
    )
  }

  const checked = outcome(state, species)
  if (checked.kind === 'fits' && checked.checked.length > 0) {
    const ul = el('ul', undefined, 'checked')
    for (const a of checked.checked) {
      const k = checks.get(a.check)
      ul.append(el('li', `${k?.kysymys ?? a.check} – ${k ? answerLabel(k, a.answer) : a.answer}`))
    }
    side.append(el('h3', t().checkedTitle), ul)
  }

  const strip = photoStrip()
  if (strip) side.append(el('h3', t().yourPhotos), strip)
  const addButton = addPhotoButton()
  if (addButton) side.append(addButton)
  setFindSpecies(top.id)
  side.append(placeSection(record?.nimi ?? null))
  side.append(el('p', t().reminder, 'reminder'), newPhotoButton())
  show('result')
}

// The pressed answer is gone after the re-render: focus moves to the next question, or to
// the result when no question is left, so a keyboard or screen reader user goes on from
// there instead of from the top of the page. Done by show() once the result is swapped in.
// From the keyboard (a click with no pointer) the page scrolls to it; after a tap or click
// the view stays at the top as before (focusAfterRender is declared next to show()).
function rerenderAfterAnswer(e: MouseEvent, next: State | null, raw: Map<string, number>) {
  result.classList.remove('enter')
  focusAfterRender = e.detail === 0 ? 'scroll' : 'stay'
  render(next, raw)
}

function focusAfterAnswer(scroll: boolean) {
  const target = result.querySelector<HTMLElement>('.verify .question') ?? result.querySelector<HTMLElement>('h2')
  if (!target) return
  target.tabIndex = -1
  target.focus({ preventScroll: !scroll })
}

// --- Find spot (#51) ---------------------------------------------------------------------
// "Tallenna löytöpaikka" reads the position only on tap: from a photo's EXIF, or else the
// current location. It is kept in memory for this mushroom only, and leaves the device only
// in a Maps link or share that the user opens (hard rule 9).

let place: { position: Position; fromPhoto: boolean } | null = null
// Raised when the photos change, so a position that arrives late for older photos is dropped.
let placeRequest = 0
// The section on screen and the species it is named after; a re-render replaces both.
let placeBox: HTMLElement | null = null
let placeName: string | null = null

function forgetPlace() {
  place = null
  placeRequest++
}

async function photoPosition(): Promise<Position | null> {
  for (const p of photos) {
    const position = exifPosition(await p.file.slice(0, EXIF_BYTES).arrayBuffer())
    if (position) return position
  }
  return null
}

function currentPosition(): Promise<Position> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('no geolocation'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }),
      reject,
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 60_000 },
    )
  })
}

async function findPlace() {
  const request = ++placeRequest
  fillPlace('loading')
  try {
    const fromPhoto = await photoPosition().catch(() => null)
    const found = fromPhoto ? { position: fromPhoto, fromPhoto: true } : { position: await currentPosition(), fromPhoto: false }
    if (request !== placeRequest) return
    place = found
    fillPlace()
    void syncFind()
  } catch {
    if (request === placeRequest) fillPlace('failed')
  }
}

// The species is null on the "not sure" screen.
function placeSection(nimi: string | null): HTMLElement {
  placeBox = el('section', undefined, 'place')
  placeName = nimi
  fillPlace()
  return placeBox
}

function fillPlace(status: 'loading' | 'failed' | null = null) {
  const box = placeBox
  if (!box) return
  const s = t()
  box.replaceChildren(el('h3', s.placeTitle))
  if (!place) {
    const save = el('button', status === 'loading' ? s.placeLoading : s.placeSave, 'secondary big')
    save.type = 'button'
    save.disabled = status === 'loading'
    save.addEventListener('click', () => void findPlace())
    box.append(save)
    if (status === 'failed') {
      box.append(el('p', s.placeFailed, 'place-error'))
    }
    box.append(el('p', s.placeNote, 'place-note'))
    box.append(findButton())
    return
  }
  const label = placeLabel(placeName, new Date(), s.placeLabel)
  const apple = appleMapsUrl(place.position, label)
  const google = googleMapsUrl(place.position)
  box.append(el('p', place.fromPhoto ? s.placeFromPhoto : s.placeCurrent, 'place-note'))
  const links = el('div', undefined, 'place-links')
  const link = (text: string, href: string) => {
    const a = el('a', text, 'secondary big')
    a.href = href
    a.target = '_blank'
    a.rel = 'noopener noreferrer'
    return a
  }
  links.append(link(s.placeApple, apple), link(s.placeGoogle, google))
  if ('share' in navigator) {
    const share = el('button', s.share, 'secondary big')
    share.type = 'button'
    // Apple devices open the Apple Maps link in Maps; others the Google one.
    const url = mapsUrl(place.position, label)
    share.addEventListener('click', () => navigator.share({ title: label, url }).catch(() => undefined))
    links.append(share)
  }
  const forget = el('button', s.placeForget, 'answer ghost')
  forget.type = 'button'
  forget.addEventListener('click', () => {
    forgetPlace()
    fillPlace()
    void syncFind()
  })
  box.append(links, forget)
  box.append(findButton())
}

function isDangerousId(id: string): boolean {
  const g = species.get(id)?.ryhma
  return g !== undefined && DANGEROUS.has(g)
}

// --- Time of year and region (#48) ------------------------------------------------------
// A species that is rarely found in Finland in that month (and region) gets a note in the
// result, from GBIF observation counts. Only a species that is not dangerous gets one: the
// note never changes the candidates, the lookalikes or the checks (hard rule 8). The month
// comes from the photo's EXIF date or today, the region from the photo's EXIF position or
// the region chosen in the settings. A position is reduced to its region at once, nothing
// else is kept, and nothing leaves the device (hard rule 9). The setting turns it all off.

const SEASON_KEY = 'seeni-season'
interface SeasonSettings {
  on: boolean
  region: RegionId | null
}
function loadSeason(): SeasonSettings {
  try {
    const s = JSON.parse(localStorage.getItem(SEASON_KEY) ?? 'null') as Partial<SeasonSettings> | null
    return { on: s?.on ?? true, region: s?.region ?? null }
  } catch {
    return { on: true, region: null }
  }
}
let season = loadSeason()
function saveSeason() {
  try {
    localStorage.setItem(SEASON_KEY, JSON.stringify(season))
  } catch {
    // Private mode: the setting lasts for this visit.
  }
}

let occurrence: Occurrence | null = null
fetch(`${base}occurrence.json`)
  .then((r) => (r.ok ? r.json() : null))
  .then((o: Occurrence | null) => {
    occurrence = o
    // A result shown before the table arrived gets its note now.
    renderSeasonSettings()
    rerenderResult()
  })
  .catch(() => undefined)

async function photoSeason(file: File): Promise<{ taken: Date | null; region: RegionId | null }> {
  try {
    const head = await file.slice(0, EXIF_BYTES).arrayBuffer()
    const p = exifPosition(head)
    return { taken: exifDate(head), region: p ? regionOf(p.lat, p.lon, occurrence?.regions) : null }
  } catch {
    return { taken: null, region: null }
  }
}

function seasonNote(id: string): HTMLElement | null {
  if (!season.on || !occurrence || isDangerousId(id)) return null
  const now = new Date()
  const month = monthOf(photos.map((p) => p.taken).find((d) => d && isRecent(d, now)) ?? null, now)
  const region = photos.find((p) => p.region)?.region ?? season.region
  if (!isRare(occurrence, id, month, region)) return null
  const s = t()
  return el('p', s.seasonRare(s.months[month - 1]!, region ? s.regionsIn[region] : null), 'season-note')
}

function seasonSettings(): HTMLElement {
  const s = t()
  const box = el('div', undefined, 'season-settings')
  const label = el('label', undefined, 'consent')
  const check = el('input')
  check.type = 'checkbox'
  check.checked = season.on
  label.append(check, el('span', s.seasonToggle))
  const regionLabel = el('label', undefined, 'season-region')
  regionLabel.append(el('span', s.seasonRegion))
  const select = el('select')
  const option = (value: string, text: string) => {
    const o = el('option', text)
    o.value = value
    o.selected = (season.region ?? '') === value
    return o
  }
  select.append(option('', s.seasonRegionAuto))
  for (const { id } of occurrence?.regions ?? REGIONS) select.append(option(id, s.regions[id]))
  select.disabled = !season.on
  regionLabel.append(select)
  check.addEventListener('change', () => {
    season = { ...season, on: check.checked }
    select.disabled = !season.on
    saveSeason()
    rerenderResult()
  })
  select.addEventListener('change', () => {
    season = { ...season, region: (select.value || null) as RegionId | null }
    saveSeason()
    rerenderResult()
  })
  box.append(el('h3', s.seasonTitle), el('p', s.seasonText, 'fine'), label, regionLabel)
  return box
}
function renderSeasonSettings() {
  $('#season-settings').replaceChildren(seasonSettings())
}
renderSeasonSettings()

// --- My finds ---------------------------------------------------------------------------
// "Tallenna omiin löytöihin" keeps this mushroom in a list on the device (finds.ts): a
// thumbnail of the first photo, the suggested species, the date and the find spot if one is
// saved. The entry follows the photos, the find spot and the species while the result is
// open. The list says "?" after the species, shows its danger label and names every
// dangerous lookalike of it (hard rule 8): it records a suggestion, not a confirmed species.

let savedFind: Find | null = null
// The photo the saved thumbnail was made from.
let savedThumbOf: File | null = null
// Raised for each new mushroom, so a save that finishes late does not attach to the next.
let findSession = 0
let savingFind = false
// The species of the result on screen (null on "not sure"), for a find saved from it.
let findSpecies: string | null = null
const findsDialog = $<HTMLDialogElement>('#finds')
// On the home screen, and on the live camera's card that covers it.
const findsOpeners = [$<HTMLButtonElement>('#finds-open'), $<HTMLButtonElement>('#live-finds')]

function setFindSpecies(id: string | null) {
  findSpecies = id
  if (savedFind && savedFind.speciesId !== id) void syncFind()
}

function findButton(): HTMLElement {
  const s = t()
  if (savedFind) {
    const done = el('p', s.findsSaved, 'find-saved')
    const open = el('button', s.findsTitle, 'live-link')
    open.type = 'button'
    open.addEventListener('click', () => void openFinds())
    done.append(' ', open)
    return done
  }
  const save = el('button', s.findsSave, 'answer ghost')
  save.type = 'button'
  save.disabled = savingFind
  save.addEventListener('click', () => void saveFind())
  return save
}

async function saveFind() {
  if (savingFind || savedFind || photos.length === 0) return
  const session = findSession
  savingFind = true
  fillPlace()
  try {
    const file = photos[0]!.file
    const find = {
      at: new Date().toISOString(),
      speciesId: findSpecies,
      thumb: await thumbnail(file),
      position: place?.position ?? null,
      fromPhoto: place?.fromPhoto ?? false,
    }
    const id = await addFind(find)
    keepStorage()
    if (session === findSession) {
      savedFind = { ...find, id }
      savedThumbOf = file
      // The species, the place or the photos may have changed while saving.
      await syncFind()
    }
  } catch {
    if (session === findSession) placeBox?.append(el('p', t().findsFailed, 'place-error'))
  } finally {
    if (session === findSession) {
      savingFind = false
      fillPlace()
    }
    void refreshFindsCount()
  }
}

// A saved find follows the find spot saved or forgotten after it, the species when later
// answers change the result, and the first photo when it is removed.
async function syncFind() {
  if (!savedFind) return
  const first = photos[0]?.file ?? null
  let thumb = savedFind.thumb
  if (first && first !== savedThumbOf) {
    thumb = await thumbnail(first).catch(() => thumb)
    savedThumbOf = first
  }
  if (!savedFind) return
  savedFind = {
    ...savedFind,
    thumb,
    speciesId: findSpecies,
    position: place?.position ?? null,
    fromPhoto: place?.fromPhoto ?? false,
  }
  await updateFind(savedFind).catch(() => undefined)
}

function forgetFind() {
  savedFind = null
  savedThumbOf = null
  savingFind = false
  findSession++
}

async function refreshFindsCount() {
  const n = await countFinds().catch(() => 0)
  for (const b of findsOpeners) {
    b.textContent = t().findsOpen(n)
    b.hidden = n === 0
  }
}

/** The maps link for the platform: Apple Maps on Apple devices, Google Maps elsewhere. */
function mapsUrl(position: Position, label: string): string {
  return /iPhone|iPad|Macintosh/.test(navigator.userAgent) ? appleMapsUrl(position, label) : googleMapsUrl(position)
}

const findUrls: string[] = []
function revokeFindUrls() {
  for (const u of findUrls.splice(0)) URL.revokeObjectURL(u)
}

async function renderFinds() {
  const s = t()
  const list = $('#finds-list')
  const finds = await listFinds().catch(() => [] as Find[])
  revokeFindUrls()
  list.replaceChildren()
  if (finds.length === 0) list.append(el('li', s.findsEmpty, 'finds-empty'))
  $('#finds-export').hidden = finds.length === 0
  for (const f of finds) {
    const li = el('li', undefined, 'find')
    const img = el('img')
    img.src = URL.createObjectURL(f.thumb)
    findUrls.push(img.src)
    img.alt = ''
    const text = el('div', undefined, 'find-text')
    const nimi = f.speciesId ? (species.get(f.speciesId)?.nimi ?? f.speciesId) : null
    const name = nimi ? `${nimi}?` : s.findsUnknown
    text.append(el('strong', name))
    const b = f.speciesId ? badge(f.speciesId) : null
    if (b) text.append(b)
    // Every dangerous lookalike of the species, whatever was checked (hard rule 8).
    const dangerous = (f.speciesId ? (species.get(f.speciesId)?.kaksoisolennot ?? []) : [])
      .filter(isDangerousId)
      .map((id) => species.get(id)?.nimi ?? id)
    if (dangerous.length) text.append(el('span', s.findsDanger(dangerous.join(', ')), 'find-danger'))
    text.append(el('span', new Date(f.at).toLocaleDateString(lang() === 'fi' ? 'fi-FI' : 'en-GB'), 'find-date'))
    const row = el('div', undefined, 'find-actions')
    if (f.position) {
      const a = el('a', s.findsMap, 'live-link')
      a.href = mapsUrl(f.position, placeLabel(nimi, new Date(f.at), s.placeLabel))
      a.target = '_blank'
      a.rel = 'noopener noreferrer'
      row.append(a)
    }
    const del = el('button', s.findsDelete, 'live-link')
    del.type = 'button'
    del.setAttribute('aria-label', `${s.findsDelete}: ${name}`)
    del.addEventListener('click', async () => {
      try {
        await deleteFind(f.id)
      } catch {
        return
      }
      if (savedFind?.id === f.id) {
        savedFind = null
        savedThumbOf = null
        fillPlace()
      }
      void refreshFindsCount()
      void renderFinds()
    })
    row.append(del)
    text.append(row)
    li.append(img, text)
    list.append(li)
  }
}

// --- Backup of the finds (backup.ts): a file the user saves and reads back ---------------
const backupStatus = $('#finds-backup-status')

async function exportFinds() {
  backupStatus.textContent = ''
  const finds = await listFinds().catch(() => null)
  if (!finds?.length) return
  const blob = new Blob([JSON.stringify(await makeBackup(finds))], { type: 'application/json' })
  // On iPhones a download does not reliably reach Files from the home-screen app, so the
  // share sheet offers "Save to Files" there.
  const file = new File([blob], backupName(), { type: 'application/json' })
  if (/iPhone|iPad/.test(navigator.userAgent) && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] })
      return
    } catch (e) {
      if ((e as Error).name === 'AbortError') return // the user closed the share sheet
      // Otherwise, e.g. the tap no longer counts after a long export: try a download.
    }
  }
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = backupName()
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 60_000)
}

let importing = false
async function importFinds(file: File) {
  if (importing) return
  importing = true
  const s = t()
  try {
    if (file.size > MAX_BACKUP_BYTES) throw new Error('too large')
    const incoming = readBackup(await file.text())
    const fresh = newFinds(incoming, await listFinds())
    await addFinds(fresh)
    if (fresh.length) keepStorage()
    backupStatus.textContent = s.findsImported(fresh.length)
  } catch {
    backupStatus.textContent = s.findsImportFailed
  } finally {
    importing = false
  }
  void refreshFindsCount()
  void renderFinds()
}

$('#finds-export').addEventListener('click', () => void exportFinds())
$('#finds-import').addEventListener('click', () => $<HTMLInputElement>('#finds-import-file').click())
$<HTMLInputElement>('#finds-import-file').addEventListener('change', (e) => {
  const input = e.currentTarget as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (file) void importFinds(file)
})

async function openFinds() {
  backupStatus.textContent = ''
  await renderFinds()
  if (!findsDialog.open) findsDialog.showModal()
}
$('#finds-open').addEventListener('click', () => void openFinds())
$('#live-finds').addEventListener('click', () => openFromLive(openFinds))
$('#finds-close').addEventListener('click', () => findsDialog.close())
findsDialog.addEventListener('close', () => {
  revokeFindUrls()
  backToLive()
})
if ('indexedDB' in window) void refreshFindsCount()

// --- Species guide ------------------------------------------------------------------------
// Every species Seeni knows, and the dangerous ones it only warns about, in one searchable
// list; each opens its species sheet, so the features and lookalikes can be read before
// going to the forest, offline. The list names no edibility (hard rule 8): the danger
// label is the only group shown.

const guideDialog = $<HTMLDialogElement>('#guide')
const guideSearch = $<HTMLInputElement>('#guide-search')

// The Finnish names, searchable in either language.
const finnishNames = new Map(records.map((r) => [r.id, r.nimi.toLocaleLowerCase()]))

function renderGuide() {
  const list = $('#guide-list')
  const query = guideSearch.value.trim().toLocaleLowerCase()
  const matches = (r: SpeciesRecord) =>
    !query ||
    [r.nimi.toLocaleLowerCase(), r.tieteellinen.toLocaleLowerCase(), finnishNames.get(r.id) ?? ''].some((n) => n.includes(query))
  const all = [...species.values()].filter(matches).sort((a, b) => a.nimi.localeCompare(b.nimi, lang()))
  list.replaceChildren()
  if (all.length === 0) list.append(el('li', t().guideNone, 'finds-empty'))
  for (const r of all) list.append(speciesRow(r.id, () => openSheet(r.id, r.id)))
}

async function openGuide() {
  // The model's class list tells the sheet which species are warnings only; the list
  // itself needs none of it, so it opens even if the files cannot be read.
  try {
    files ??= await loadFiles(base)
    modelClasses ??= new Set(files.labels.map((l) => l.id))
  } catch {
    // The sheets open once the files are read.
  }
  guideSearch.value = ''
  guideSearch.placeholder = t().guideSearch
  renderGuide()
  if (!guideDialog.open) guideDialog.showModal()
}

// A list opened from the live camera's card stops the camera while it is open, and the
// camera starts again when the list closes.
let listFromLive = false
function openFromLive(open: () => Promise<void>) {
  liveDismissed = true
  stopLive()
  listFromLive = true
  void open()
}
function backToLive() {
  if (!listFromLive) return
  listFromLive = false
  if (currentView === 'home') {
    liveDismissed = false
    void startLive()
  }
}
$('#guide-open').addEventListener('click', () => void openGuide())
$('#live-guide').addEventListener('click', () => openFromLive(openGuide))
$('#guide-close').addEventListener('click', () => guideDialog.close())
guideDialog.addEventListener('close', backToLive)
guideSearch.addEventListener('input', renderGuide)

// --- Install as an app -------------------------------------------------------------------
// Opened from the home screen, Seeni gets the whole screen, and Safari does not clear its
// storage (the finds) after a week without visits. Chrome and Edge offer their own install
// prompt; on iPhones and iPads the dialog tells how to add Seeni from the Share menu.
const installDialog = $<HTMLDialogElement>('#install')
const installOpeners = [$<HTMLButtonElement>('#install-open'), $<HTMLButtonElement>('#live-install')]
// Safari and the other iOS browsers have Add to Home Screen in the Share menu; in-app
// browsers (Facebook, Instagram, …) do not, and their user agents lack "Safari/".
const ua = navigator.userAgent
const isIos =
  (/iPhone|iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) &&
  /Safari\//.test(ua) &&
  !/FBAN|FBAV|Instagram|Line\//.test(ua)
const installed = () =>
  matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
let installPrompt: (Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: string }> }) | null = null

function showInstall() {
  const offer = !installed() && (installPrompt !== null || isIos)
  for (const b of installOpeners) b.hidden = !offer
}
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault()
  installPrompt = e as typeof installPrompt
  showInstall()
})
window.addEventListener('appinstalled', () => {
  installPrompt = null
  for (const b of installOpeners) b.hidden = true
})
async function openInstall() {
  if (installPrompt) {
    const prompt = installPrompt
    installPrompt = null // a prompt can be shown only once
    showInstall()
    try {
      await prompt.prompt()
      await prompt.userChoice
    } catch {
      // Refused, e.g. already used: the link stays hidden until the browser offers it again.
    }
    return
  }
  // An installed app on an iPhone has storage of its own: the finds move only by a backup.
  $('#install-finds').hidden = (await countFinds().catch(() => 0)) === 0
  if (!installDialog.open) installDialog.showModal()
}
$('#install-open').addEventListener('click', () => void openInstall())
$('#live-install').addEventListener('click', () => (installPrompt ? void openInstall() : openFromLive(openInstall)))
$('#install-close').addEventListener('click', () => installDialog.close())
installDialog.addEventListener('close', backToLive)
showInstall()

// --- Species sheet (#47) -----------------------------------------------------------------
// A lookalike in the result opens its identification info in a modal: features, how it
// differs from the species of the result, its own lookalikes (which open in the same modal,
// with a back step) and sources. Each opened sheet is a history entry, so the phone's back
// button steps back and finally closes it. Opening a sheet changes nothing in the flow.

const sheetDialog = $<HTMLDialogElement>('#sheet')
const sheetBody = $('#sheet-body')
const sheetBack = $<HTMLButtonElement>('#sheet-back')
// The sheets opened, the current one last; each has one history entry.
let sheetStack: { id: string; compareTo: string }[] = []

function renderSheet() {
  const current = sheetStack[sheetStack.length - 1]
  if (!current || !modelClasses) return
  const s = sheet(current.id, current.compareTo, species, modelClasses)
  const text = sheetText()
  sheetBack.hidden = sheetStack.length < 2
  sheetBody.replaceChildren()
  sheetBody.append(photo(s.id, 'sheet-photo'))
  sheetBody.append(el('h2', s.nimi))
  sheetBody.lastElementChild!.id = 'sheet-title'
  sheetBody.append(el('p', s.tieteellinen, 'latin'))
  const b = badge(s.id)
  if (b) sheetBody.append(b)
  if (s.warningOnly) {
    sheetBody.append(
      el('p', text.warningOnly, 'sheet-note'),
    )
  }
  if (s.tuntomerkit.length) {
    sheetBody.append(el('h3', text.features))
    const ul = el('ul', undefined, 'features')
    for (const t of s.tuntomerkit) ul.append(el('li', t))
    sheetBody.append(ul)
  }
  if (s.compareTo) {
    sheetBody.append(el('h3', text.compare(s.compareTo.nimi)))
    if (s.compareTo.differences.length === 0) {
      sheetBody.append(el('p', text.noDifference, 'sheet-note'))
    } else {
      const ul = el('ul', undefined, 'differences')
      for (const d of s.compareTo.differences) {
        const li = el('li')
        li.append(el('p', d.check.kysymys, 'difference-question'))
        const dl = el('dl')
        const answers = (keys: string[]) => keys.map((k) => answerLabel(d.check, k)).join(t().or) || '–'
        dl.append(el('dt', s.nimi), el('dd', answers(d.self)))
        dl.append(el('dt', s.compareTo.nimi), el('dd', answers(d.other)))
        li.append(dl)
        ul.append(li)
      }
      sheetBody.append(ul)
    }
  }
  if (s.lookalikes.length) {
    sheetBody.append(el('h3', text.lookalikes))
    const ul = el('ul', undefined, 'sheet-lookalikes')
    for (const l of s.lookalikes) {
      const li = el('li')
      const open = el('button', l.nimi, 'link')
      open.type = 'button'
      open.addEventListener('click', () => openSheet(l.id, current.compareTo))
      li.append(open)
      const lb = badge(l.id)
      if (lb) li.append(lb)
      ul.append(li)
    }
    sheetBody.append(ul)
  }
  if (s.lahteet.length) {
    sheetBody.append(el('h3', text.sources))
    const ul = el('ul', undefined, 'sources')
    for (const t of s.lahteet) ul.append(el('li', t))
    sheetBody.append(ul)
  }
  sheetBody.append(el('p', t().reminder, 'reminder'))
  sheetDialog.scrollTop = 0
}

function openSheet(id: string, compareTo: string) {
  if (!species.has(id) || !modelClasses) return
  sheetStack.push({ id, compareTo })
  pushEntry(sheetStack.length)
  renderSheet()
  if (!sheetDialog.open) sheetDialog.showModal()
}

// Every sheet has a history entry: back (the phone's, the arrow, or Escape) goes one sheet
// back, and closing goes back over all of them. Back from the result (or the wait) goes to
// the start screen, and back while adding a photo returns to the result.
window.addEventListener('popstate', () => {
  const depth = entry()?.sheet ?? 0
  if (sheetStack.length > depth) {
    sheetStack.length = depth
    if (depth === 0) sheetDialog.close()
    else renderSheet()
  }
  if (leavingEntry) {
    // The back step of a button that went home. A photo picked in between has started
    // loading without an entry of its own.
    leavingEntry = false
    if (currentView !== 'home') pushEntry()
    return
  }
  if (onViewEntry()) {
    // Forward onto an entry that nothing on screen matches: step back over it. (A sheet
    // opened from the species guide is on the start screen too.)
    if (depth > sheetStack.length || (currentView === 'home' && !adding && sheetStack.length === 0)) history.back()
    return
  }
  // Back to the start screen. The webcam dialog may be open on a computer.
  if (webcamDialog.open) webcamDialog.close()
  if (adding || (currentView === 'loading' && loadingAdded)) {
    // Back while adding a photo (or waiting for the added one): the result as it was.
    latest++
    setAdding(false)
    if (shown) render(shown.state, shown.raw)
  } else if (currentView !== 'home') {
    // A photo still being identified is not shown.
    latest++
    show('home')
  }
})
function closeSheet() {
  const n = sheetStack.length
  sheetStack = []
  if (sheetDialog.open) sheetDialog.close()
  if (n > 0) history.go(-n)
}
sheetBack.addEventListener('click', () => history.back())
$('#sheet-close').addEventListener('click', closeSheet)
// Android's back button reaches a modal dialog as `cancel`: one sheet back, like popstate.
sheetDialog.addEventListener('cancel', (e) => {
  e.preventDefault()
  history.back()
})
// A browser may still close it on its own (a second quick Escape); drop the leftover entries.
sheetDialog.addEventListener('close', () => {
  if (sheetStack.length > 0) closeSheet()
})
// The backdrop: a press and release both on the dialog element itself, outside its content.
let pressOnBackdrop = false
sheetDialog.addEventListener('pointerdown', (e) => (pressOnBackdrop = e.target === sheetDialog))
sheetDialog.addEventListener('click', (e) => {
  if (pressOnBackdrop && e.target === sheetDialog) closeSheet()
  pressOnBackdrop = false
})

// --- Photos in ---------------------------------------------------------------------------

// Only the latest set of photos may show a result.
let latest = 0

// The chosen photo, shown while it is identified. The object URL only lives in memory.
const preview = $<HTMLImageElement>('#preview')
function setPreview(image: Blob | null) {
  if (preview.src) URL.revokeObjectURL(preview.src)
  if (image) preview.src = URL.createObjectURL(image)
  else preview.removeAttribute('src')
  views.loading.classList.toggle('has-preview', image !== null)
}

// Identifying takes well under a second, so the loading view stays up for a moment;
// otherwise the page would flash from the photo to the result.
const MIN_LOADING_MS = reducedMotion ? 300 : 1400
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// The photos of the mushroom being identified (#46): kept as the files (compressed) and
// their probabilities, so adding or removing a photo runs the model only on the new one.
// Everything stays in memory on the device (hard rule 9).
const MAX_PHOTOS = 5
interface Photo {
  // Kept for its EXIF position (#51), read only when the user asks for it.
  file: File
  url: string
  probabilities: number[]
  // For the season note (#48): when the photo was taken and its coarse region; the precise
  // position is not kept.
  taken: Date | null
  region: RegionId | null
}
let photos: Photo[] = []
// The answers given for the current mushroom, also when the last one led to "not sure".
let asked: State['asked'] = []
// Shown once in the next result, e.g. when photos over the limit were left out.
let photoNotice = ''
// True while the user takes or picks another photo of the same mushroom.
let adding = false
// True while the photo being identified is added to the earlier ones.
let loadingAdded = false

function clearPhotos() {
  for (const p of photos) URL.revokeObjectURL(p.url)
  photos = []
  forgetPlace()
  forgetFind()
}

// None of the chosen files could be decoded as an image.
class Unreadable extends Error {}

async function identify(images: File[]) {
  if (images.length === 0) return
  const add = adding && photos.length > 0
  loadingAdded = add
  setAdding(false)
  const room = add ? MAX_PHOTOS - photos.length : MAX_PHOTOS
  const chosen = images.slice(0, Math.max(0, room))
  if (chosen.length < images.length) {
    photoNotice = t().tooManyPhotos(MAX_PHOTOS, images.length - chosen.length)
  }
  if (chosen.length === 0) {
    show('result')
    return
  }
  stopLive()
  const request = ++latest
  const minimum = wait(MIN_LOADING_MS)
  setPreview(chosen[0]!)
  // Results fade in once; re-renders after an answer do not hide anything again.
  result.classList.add('enter')
  show('loading')
  try {
    files ??= await loadFiles(base)
    modelClasses ??= new Set(files.labels.map((l) => l.id))
    // The photos' dates and regions are read while the model runs.
    const [r, meta] = await Promise.all([classify(chosen), Promise.all(chosen.map(photoSeason))])
    await minimum
    if (request !== latest) return
    if (r.kind !== 'result') throw new Error(r.kind === 'error' ? r.message : r.kind)
    const readable = chosen.flatMap((file, i) => {
      const probabilities = r.perImage[i]
      return probabilities ? [{ file, probabilities, ...meta[i]! }] : []
    })
    if (readable.length === 0) throw new Unreadable()
    if (readable.length < chosen.length) {
      photoNotice = [photoNotice, t().unreadablePhotos(chosen.length - readable.length)].filter(Boolean).join(' ')
    }
    if (!add) {
      clearPhotos()
      asked = []
    }
    for (const p of readable) photos.push({ ...p, url: URL.createObjectURL(p.file) })
    identifyPhotos()
  } catch (e) {
    await minimum
    if (request !== latest) return
    resultOfPhotos = false
    photoNotice = ''
    if (e instanceof Unreadable) result.replaceChildren(el('h2', t().unreadableTitle), el('p', t().unreadableText))
    else result.replaceChildren(el('h2', t().failed), el('p', String(e)))
    // An added photo that fails leaves the earlier photos and answers as they were.
    if (add) {
      const back = el('button', t().backToResult, 'secondary big')
      back.addEventListener('click', () => identifyPhotos())
      result.append(back)
    }
    result.append(newPhotoButton())
    show('result')
  }
}

// The result for the current photos; the answers given so far are kept when they still fit.
function identifyPhotos() {
  if (!files || photos.length === 0) return
  const perImage = photos.map((p) => p.probabilities)
  const mean = averageProbabilities(perImage)
  const raw = new Map(files.labels.map((l, i) => [l.id, mean[i] ?? 0]))
  const first = start(mean, files.labels, species, files.calibration, perImage)
  let state = first.kind === 'flow' ? first.state : null
  if (state) state = replay(state, asked, species)
  render(state, raw)
}

function removePhoto(index: number) {
  const [gone] = photos.splice(index, 1)
  if (gone) URL.revokeObjectURL(gone.url)
  // The position may have come from the removed photo, or be on its way from it.
  if (place?.fromPhoto) place = null
  placeRequest++
  identifyPhotos()
  void syncFind()
}

// "Lisää kuva": back to the start screen to take or pick one more photo of the same mushroom.
function setAdding(on: boolean) {
  adding = on
  $('#adding').hidden = !on
  document.body.classList.toggle('adding', on)
  if (on) $('#adding-count').textContent = `${photos.length + 1}/${MAX_PHOTOS}`
}

function addPhotoButton(): HTMLElement | null {
  if (photos.length === 0 || photos.length >= MAX_PHOTOS) return null
  const b = el('button', undefined, 'secondary big')
  b.innerHTML = ICON.plus
  b.append(` ${t().addPhoto}`)
  b.addEventListener('click', () => {
    setAdding(true)
    show('home')
  })
  return b
}

// The user's photos as thumbnails, each with a remove button when there are several.
function photoStrip(): HTMLElement | null {
  if (photos.length === 0) return null
  const strip = el('div', undefined, 'photo-strip')
  if (photoNotice) {
    const wrap = el('div')
    wrap.append(el('p', photoNotice, 'photo-notice'), strip)
    photoNotice = ''
    fillStrip(strip)
    return wrap
  }
  fillStrip(strip)
  return strip
}

function fillStrip(strip: HTMLElement) {
  photos.forEach((p, i) => {
    const item = el('figure', undefined, 'shot')
    const img = el('img')
    img.src = p.url
    img.alt = t().yourPhoto(i + 1)
    item.append(img)
    if (photos.length > 1) {
      const remove = el('button', undefined, 'shot-remove')
      remove.type = 'button'
      remove.setAttribute('aria-label', t().removePhoto(i + 1))
      remove.innerHTML = ICON.close
      remove.addEventListener('click', () => removePhoto(i))
      item.append(remove)
    }
    strip.append(item)
  })
}

// --- Live camera on phones (#43) ---------------------------------------------------------
// On a phone the start screen is the back camera, blurred behind a card with "Ota kuva" and
// "Valitse kuva". "Ota kuva" clears the blur and shows a shutter. Without a camera, with
// permission denied, or on a large screen, the start screen is the plain home view. The
// camera runs only while this screen is visible, and never before the consent.

const live = $('#live')
const liveCamera = createLiveCamera(live.querySelector('video')!)
const statusAnchor = status.previousElementSibling!
const shutter = $<HTMLButtonElement>('#live-shutter')
const liveRetry = $<HTMLButtonElement>('#live-retry')
const liveHelp = $('#live-help')
// Set once the camera has failed (denied or broken), so the user is not asked again
// automatically; only "Käytä live-kameraa" asks again.
let liveFailed = false
// Set when that request failed too, to show how to allow the camera.
let retryFailed = false

function updateRetry() {
  liveRetry.hidden = !liveFailed || largeScreen.matches
  liveHelp.hidden = liveRetry.hidden || !retryFailed
}
// Set while "Tietoa ja lähteet" is read from the live card; cleared when home is shown again.
let liveDismissed = false

function setLive(on: boolean) {
  live.hidden = !on
  document.body.classList.toggle('live-on', on)
  if (on) live.querySelector('.live-status')!.append(status)
  else statusAnchor.after(status)
}

function liveAllowed(): boolean {
  return (
    consented && !liveFailed && !liveDismissed && !largeScreen.matches && currentView === 'home' && !document.hidden
  )
}

async function startLive() {
  if (!liveAllowed() || liveCamera.running || !(await hasCamera()) || !liveAllowed()) return
  if (live.hidden) {
    // Another photo of the same mushroom: straight to the shutter, the card was seen already.
    live.classList.toggle('shooting', adding)
    shutter.disabled = true
    setLive(true)
  }
  const result = await liveCamera.start()
  if (result === 'failed') {
    liveFailed = true
    setLive(false)
  } else if (!liveAllowed()) stopLive()
  updateRetry()
}

// After a denied permission, the plain start screen offers to ask again (#69). The browser
// may reject the new request without asking, so the help tells how to allow the camera.
liveRetry.addEventListener('click', async () => {
  if (await hasCamera()) {
    liveFailed = false
    await startLive()
  }
  // Still failed, or no attempt could be made: the flag stays set and the help shows.
  if (!liveCamera.running) liveFailed = true
  retryFailed = liveFailed
  updateRetry()
})

function stopLive() {
  liveCamera.stop()
  setLive(false)
}

// The shutter works once the camera shows a picture.
live.querySelector('video')!.addEventListener('playing', () => (shutter.disabled = false))
$('#live-take').addEventListener('click', () => live.classList.add('shooting'))
$('#live-back').addEventListener('click', () => live.classList.remove('shooting'))
shutter.addEventListener('click', async () => {
  if (shutter.disabled) return
  shutter.disabled = true
  const photo = await liveCamera.capture()
  if (photo) void identify([photo])
  else shutter.disabled = false
})
$('#live-info').addEventListener('click', () => {
  liveDismissed = true
  stopLive()
  openAbout()
})
document.addEventListener('visibilitychange', () => {
  if (document.hidden) stopLive()
  else void startLive()
})
largeScreen.addEventListener('change', () => {
  updateRetry()
  if (largeScreen.matches) stopLive()
  else void startLive()
})
void startLive()

// A webcam on a computer: the button shows only when a camera is connected.
const webcamDialog = $<HTMLDialogElement>('#webcam-dialog')
const openWebcam = setupWebcam(
  webcamDialog,
  webcamDialog.querySelector('video')!,
  $<HTMLButtonElement>('#shutter'),
  webcamDialog.querySelector<HTMLElement>('.note')!,
  (photo) => void identify([photo]),
)
$('#webcam-cancel').addEventListener('click', () => webcamDialog.close())
$('#webcam').addEventListener('click', () => void openWebcam())
async function checkCamera() {
  const found = largeScreen.matches && (await hasCamera())
  $('#webcam').hidden = !found
  $('.actions').classList.toggle('has-webcam', found)
}
void checkCamera()
navigator.mediaDevices?.addEventListener?.('devicechange', () => void checkCamera())
largeScreen.addEventListener('change', () => {
  startGrassIfLarge()
  void checkCamera()
})

// The buttons are labels for hidden file inputs; Enter and Space open them like a button.
for (const label of document.querySelectorAll<HTMLLabelElement>('.actions label, .live label')) {
  label.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return
    e.preventDefault()
    label.click()
  })
}

for (const id of ['#camera', '#gallery']) {
  const input = $<HTMLInputElement>(id)
  input.addEventListener('change', () => {
    const images = Array.from(input.files ?? [])
    input.value = ''
    void identify(images)
  })
}

// Some images (e.g. HEIC on Windows) have no MIME type; let the decoder decide for those.
const isImage = (f: File) => f.type === '' || f.type.startsWith('image/')

// A photo dragged over the page brings a gust of wind to the grass and the drop area.
function gust(on: boolean) {
  grass?.setGust(on)
  dropArt?.setGust(on)
}

// Drag and drop for large screens: photos dropped anywhere on the page are identified.
const drop = $('#drop')
let dragDepth = 0
window.addEventListener('dragenter', (e) => {
  if (!e.dataTransfer?.types.includes('Files') || !consented || document.querySelector('dialog[open]')) return
  dragDepth++
  drop.classList.add('dragging')
  gust(true)
})
window.addEventListener('dragleave', (e) => {
  if (!e.dataTransfer?.types.includes('Files')) return
  // Leaving the window (no related target) always ends the drag, even if a count was missed.
  if (e.relatedTarget === null || --dragDepth <= 0) {
    dragDepth = 0
    drop.classList.remove('dragging')
    gust(false)
  }
})
window.addEventListener('dragover', (e) => {
  if (e.dataTransfer?.types.includes('Files')) e.preventDefault()
})
window.addEventListener('drop', (e) => {
  if (!e.dataTransfer?.types.includes('Files')) return
  e.preventDefault()
  dragDepth = 0
  drop.classList.remove('dragging')
  gust(false)
  // The warning has to be accepted first, and the webcam dialog covers the page.
  if (!consented || document.querySelector('dialog[open]')) return
  const files = Array.from(e.dataTransfer.files)
  const images = files.filter(isImage)
  // Only other files (a PDF, a document): the same explanation as for a file that cannot be
  // opened, instead of nothing happening.
  void identify(images.length > 0 ? images : files)
})

// Pasting an image from the clipboard identifies it too.
window.addEventListener('paste', (e) => {
  // The warning has to be accepted first, and the webcam dialog covers the page.
  if (!consented || document.querySelector('dialog[open]')) return
  const images = Array.from(e.clipboardData?.files ?? []).filter(isImage)
  if (images.length === 0) return
  e.preventDefault()
  void identify(images)
})

// --- Photographer credits, loaded when opened --------------------------------------------

interface Attributions {
  images: number
  downloads: { doi: string; citation: string }[]
  photographers: { name: string; images: number; licenses: string[] }[]
}

let photographersLoaded = false
async function loadPhotographers() {
  if (photographersLoaded || !$<HTMLDetailsElement>('#about').open) return
  photographersLoaded = true
  const target = $('#photographers')
  try {
    const response = await fetch(`${base}attributions.json`)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const a: Attributions = await response.json()
    const intro = el('p', t().trainedOn(a.images))
    a.downloads.forEach((d, i) => {
      const link = el('a', d.citation)
      link.href = `https://doi.org/${d.doi}`
      intro.append(link, i < a.downloads.length - 1 ? '; ' : '.')
    })
    const list = el('ul', undefined, 'photographers')
    for (const p of a.photographers) {
      list.append(el('li', t().photographer(p.name, p.images, p.licenses.join(', '))))
    }
    target.replaceChildren(intro, list)
  } catch (e) {
    target.replaceChildren(el('p', t().listFailed(String(e))))
  }
}
$<HTMLDetailsElement>('#about').addEventListener('toggle', () => void loadPhotographers())

// --- Language (#52) ----------------------------------------------------------------------
// The header button switches between Finnish and English at once: the page texts, the
// species texts and the open result and sheet, keeping the photos and the answers.

// The result again, in place: after a change of language or setting.
function rerenderResult() {
  if (currentView !== 'result' || !resultOfPhotos || photos.length === 0) return
  result.classList.remove('enter')
  inPlace = true
  try {
    if (shown) render(shown.state, shown.raw)
    else identifyPhotos()
  } finally {
    inPlace = false
  }
}

function switchLang(l: Lang) {
  setLang(l, true)
  species = speciesMap(localizeRecords(records, l, english))
  checks = checkById(species)
  applyStatic()
  setStatus(statusText, status.classList.contains('ready'))
  rerenderResult()
  renderSeasonSettings()
  void refreshFindsCount()
  if (findsDialog.open) void renderFinds()
  guideSearch.placeholder = t().guideSearch
  if (guideDialog.open) renderGuide()
  // A link with ?lang= would otherwise override the choice on the next load.
  const url = new URL(location.href)
  if (url.searchParams.has('lang')) {
    url.searchParams.delete('lang')
    history.replaceState(history.state, '', url)
  }
  if (sheetDialog.open) renderSheet()
  photographersLoaded = false
  $('#photographers').replaceChildren(el('p', t().loading))
  void loadPhotographers()
}
for (const button of document.querySelectorAll('#lang, #warning-lang')) {
  button.addEventListener('click', () => switchLang(lang() === 'fi' ? 'en' : 'fi'))
}

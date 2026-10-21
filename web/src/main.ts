// The app, mobile first: a one-time consent, then take or pick a photo, a short wait, and the
// identified species with its photo, group, lookalikes and how to make sure. Everything
// runs on the device; no image or result is sent anywhere (hard rule 9).
import speciesRecords from '../../species/species.json'
import {
  DANGEROUS,
  answer,
  isDone,
  nextCheck,
  outcome,
  skip,
  speciesMap,
  start,
  type Group,
  type SpeciesRecord,
  type State,
} from './flow.ts'
import { checkPicture } from './checkArt.ts'
import { startDropArt, type DropArt } from './dropArt.ts'
import { startGrass, type Grass } from './grass.ts'
import { loadFiles, type ModelFiles } from './modelFiles.ts'
import { hasCamera, setupWebcam } from './webcam.ts'
import type { Request, Response } from './worker.ts'
import './style.css'

const species = speciesMap(speciesRecords as unknown as SpeciesRecord[])
const base = import.meta.env.BASE_URL
const REMINDER = 'Tunnistus ei ole koskaan varma. Älä syö sientä tämän sovelluksen perusteella.'

// Stroke icons, inline so they work offline and follow the text colour.
const svg = (body: string, size = 24) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`
const ICON = {
  camera: svg('<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>'),
  image: svg('<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/>'),
  info: svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.01"/>', 20),
  plus: svg('<path d="M12 5v14M5 12h14"/>', 20),
  mushroom: `<svg class="mushroom" viewBox="0 0 120 120" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 58c0-22 20-38 44-38s44 16 44 38c0 4-3 6-7 6H23c-4 0-7-2-7-6z"/><path d="M48 64c-1 14-4 26-8 36h40c-4-10-7-22-8-36"/><path d="M40 40c4-4 9-7 15-8M76 34h.01M62 44h.01M86 46h.01"/></svg>`,
}

const app = document.querySelector<HTMLDivElement>('#app')!
app.innerHTML = `
  <dialog id="warning" aria-labelledby="warning-title" closedby="none">
    <h2 id="warning-title">Ennen kuin aloitat</h2>
    <p>Seeni ehdottaa sienilajeja kuvasta ja näyttää niiden vaaralliset kaksoisolennot. Se ei kerro,
    voiko sientä syödä, eikä sen tuloksiin voi luottaa sataprosenttisesti. Lajitiedot ovat
    tarkistamattomia luonnoksia.</p>
    <p><strong>Älä koskaan syö sientä tämän sovelluksen perusteella.</strong>
    Varmista tunnistus aina sieneuvojalta tai luotettavasta lähteestä.</p>
    <p class="fine">Kuvat käsitellään vain tällä laitteella, eikä mitään lähetetä minnekään.
    Koodi on MIT-lisensoitu, malli ja lajitiedot CC BY 4.0. Kuvaajat ja lähteet löydät myöhemmin
    kohdasta Tietoa ja lähteet.</p>
    <label class="consent"><input id="consent-check" type="checkbox" />
    <span>Ymmärrän, että tunnistus voi olla väärä, enkä syö sientä sovelluksen perusteella.</span></label>
    <button id="accept" class="primary" type="button" disabled>Hyväksyn</button>
  </dialog>

  <header class="topbar">
    <h1 class="logo">
      <img src="${base}icons/icon-192.png" alt="" width="36" height="36" />
      <span>Seeni</span>
    </h1>
    <button id="again" class="pill" type="button" hidden>${ICON.plus} Uusi kuva</button>
    <button id="info" class="round" type="button" aria-label="Tietoa ja lähteet">${ICON.info}</button>
  </header>

  <section id="home" class="view">
    <p class="intro">Kuvaa sieni, niin Seeni ehdottaa lajia ja kertoo, miten sen voi varmistaa.</p>
    <label id="drop" class="drop" for="gallery" aria-hidden="true">
      <span class="drop-text">Pudota kuva</span>
      ${ICON.mushroom}
      <canvas class="art"></canvas>
    </label>
    <div class="actions">
      <button id="webcam" class="primary big" type="button" hidden>${ICON.camera} Ota kuva</button>
      <label class="primary big" for="camera" tabindex="0">${ICON.camera} Ota kuva</label>
      <input id="camera" type="file" accept="image/*" capture="environment" hidden />
      <label class="secondary big" for="gallery" tabindex="0">${ICON.image} Valitse kuva</label>
      <input id="gallery" type="file" accept="image/*" multiple hidden />
    </div>
    <p class="hint">Parhaiten onnistuu, kun koko sieni näkyy. Voit valita useita kuvia samasta sienestä.</p>
    <p id="status" class="status">Ladataan mallia…</p>
  </section>

  <section id="loading" class="view" hidden>
    <figure class="scan" aria-hidden="true"><img id="preview" alt="" /></figure>
    <span class="loader" aria-hidden="true">${ICON.mushroom}</span>
    <p>Tunnistetaan…</p>
  </section>

  <section id="result" class="view" hidden aria-live="polite"></section>

  <dialog id="webcam-dialog" aria-label="Kamera">
    <video autoplay playsinline muted></video>
    <p class="note" aria-live="polite"></p>
    <div class="row">
      <button id="shutter" class="primary big" type="button">${ICON.camera} Ota kuva</button>
      <button id="webcam-cancel" class="secondary big" type="button">Peruuta</button>
    </div>
  </dialog>

  <canvas id="grass" aria-hidden="true"></canvas>

  <footer>
    <details id="about">
      <summary>Tietoa ja lähteet</summary>
      <p>Seeni ei kerro, voiko sientä syödä. Se ehdottaa lajeja, näyttää niiden vaaralliset
      kaksoisolennot ja ohjaa tarkistamaan tuntomerkit. Kuvat käsitellään vain tällä laitteella,
      eikä mitään lähetetä minnekään. Lajitiedot ovat tarkistamattomia luonnoksia.</p>
      <p>Malli on opetettu valokuvilla, jotka on jaettu <a href="https://www.gbif.org/">GBIF</a>in
      kautta CC0- tai CC BY -lisenssillä (GBIF.org, lataukset
      <a href="https://doi.org/10.15468/dl.fadmpu">10.15468/dl.fadmpu</a> ja
      <a href="https://doi.org/10.15468/dl.3x49qy">10.15468/dl.3x49qy</a>). Lajien nimet ovat
      <a href="https://doi.org/10.15468/39omei">GBIFin taksonomiasta</a> ja
      <a href="https://laji.fi/">Laji.fi:stä</a> (CC BY 4.0), lajivalinta Ruokaviraston
      kauppasienilistasta. Malli perustuu EfficientNet-B0-painoihin
      (<a href="https://huggingface.co/timm/efficientnet_b0.ra_in1k">timm</a>, Apache-2.0) ja
      toimii selaimessa <a href="https://github.com/microsoft/onnxruntime">onnxruntime-webillä</a> (MIT).
      Lisenssit: koodi MIT, malli ja lajitiedot CC BY 4.0.
      <a href="https://github.com/Luukalindgren/seeni">Lähdekoodi</a>.</p>
      <h3>Kuvaajat</h3>
      <div id="photographers"><p>Ladataan…</p></div>
    </details>
  </footer>
`

const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel)!
const views = { home: $('#home'), loading: $('#loading'), result: $('#result') }
const status = $<HTMLParagraphElement>('#status')
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
  $('#drop').classList.add('live')
  dropArt = startDropArt($<HTMLCanvasElement>('#drop .art'), reducedMotion)
  dropArt.setVisible(currentView === 'home')
}

function show(view: keyof typeof views) {
  currentView = view
  const swap = () => {
    for (const [name, el] of Object.entries(views)) el.hidden = name !== view
    again.hidden = view !== 'result'
    window.scrollTo(0, 0)
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

again.addEventListener('click', () => show('home'))
$('#info').addEventListener('click', () => {
  const about = $<HTMLDetailsElement>('#about')
  about.open = true
  about.scrollIntoView({ behavior: 'smooth' })
})

// --- Consent, once ----------------------------------------------------------------------
// Nothing can be used before the warning is accepted. The acceptance is stored with a
// version, so a changed warning can ask again by raising CONSENT_VERSION. Without storage
// (private mode) the warning shows on every visit.

const CONSENT_KEY = 'seeni-consent'
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
accept.addEventListener('click', () => {
  if (!consentCheck.checked) return
  try {
    localStorage.setItem(CONSENT_KEY, JSON.stringify({ version: CONSENT_VERSION, acceptedAt: new Date().toISOString() }))
  } catch {
    // Private mode: the warning shows again next time.
  }
  dialog.close()
})
// Escape must not close it; browsers without `closedby` would otherwise allow that.
dialog.addEventListener('cancel', (e) => e.preventDefault())
if (!hasConsent()) dialog.showModal()

// --- Model in a worker -------------------------------------------------------------------

const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
let files: ModelFiles | null = null
let nextId = 1
const pending = new Map<number, (r: Response) => void>()

worker.onmessage = (event: MessageEvent<Response>) => {
  const r = event.data
  if (r.id === 0) {
    if (r.kind === 'ready') {
      status.textContent = 'Valmis · toimii ilman verkkoa'
      status.classList.add('ready')
    }
    else if (r.kind === 'error') status.textContent = `Mallin lataus epäonnistui: ${r.message}`
    return
  }
  pending.get(r.id)?.(r)
  pending.delete(r.id)
}

// A worker that fails to load or crashes would leave every request waiting forever.
function failAll(message: string) {
  status.classList.remove('ready')
  status.textContent = `Tunnistin ei toimi: ${message}`
  for (const [id, resolve] of pending) resolve({ id, kind: 'error', message })
  pending.clear()
}
worker.onerror = (e) => failAll(e.message || 'virhe tunnistimessa')
worker.onmessageerror = () => failAll('viesti tunnistimelta ei kelvannut')

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

const GROUP_LABEL: Partial<Record<Group, string>> = {
  tappava: 'Tappavan myrkyllinen',
  myrkyllinen: 'Myrkyllinen',
  esikäsiteltävä: 'Myrkyllinen raakana',
}

function badge(id: string): HTMLElement | null {
  const g = species.get(id)?.ryhma
  const label = g ? GROUP_LABEL[g] : undefined
  return label ? el('span', label, `badge ${g === 'esikäsiteltävä' ? 'pre' : 'danger'}`) : null
}

function photo(id: string, cls: string): HTMLElement {
  const figure = el('figure', undefined, cls)
  const img = el('img')
  img.src = `${base}species/${id}.jpg`
  img.alt = species.get(id)?.nimi ?? id
  img.loading = 'lazy'
  figure.append(img)
  const c = credits[id]
  if (c && cls === 'hero-photo') {
    const caption = el('figcaption', `Kuva: ${c.author}, ${c.license}`)
    figure.append(caption)
  }
  return figure
}

function newPhotoButton(): HTMLElement {
  const b = el('button', 'Tunnista uusi sieni', 'primary big')
  b.addEventListener('click', () => show('home'))
  return b
}

function renderNotSure() {
  const box = el('div', undefined, 'unsure')
  const icon = el('span', undefined, 'unsure-icon')
  icon.innerHTML = ICON.mushroom
  icon.setAttribute('aria-hidden', 'true')
  const tips = el('ul', undefined, 'tips')
  for (const tip of ['Lakki ylhäältä', 'Lakin alapinta', 'Jalan tyvi']) tips.append(el('li', tip))
  box.append(
    icon,
    el('h2', 'En tunnista varmasti'),
    el('p', 'Sieni voi olla laji, jota Seeni ei tunne, tai kuva voi olla epäselvä.'),
    el('p', 'Kuvaa koko sieni läheltä ja hyvässä valossa:'),
    tips,
    el('p', REMINDER, 'reminder'),
    newPhotoButton(),
  )
  result.replaceChildren(box)
  show('result')
}

function render(state: State | null, raw: Map<string, number>) {
  if (state === null) {
    renderNotSure()
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
    body.append(el('p', 'Vastauksesi sopivat tähän lajiin.', 'confidence'))
  } else {
    // Never "100 %": the model is never certain.
    const percent = Math.min(99, Math.round((raw.get(top.id) ?? top.probability) * 100))
    const meter = el('div', undefined, 'meter')
    const bar = el('span')
    bar.style.width = `${percent}%`
    meter.append(bar)
    const confidence = el('p', undefined, 'confidence')
    confidence.append(meter, el('span', `Mallin arvio: ${percent} %`))
    body.append(confidence)
  }
  if (record?.tuntomerkit.length) {
    const ul = el('ul', undefined, 'features')
    for (const t of record.tuntomerkit) ul.append(el('li', t))
    body.append(ul)
  }
  hero.append(body)
  // Everything below the species goes in one column, beside the photo on large screens.
  const side = el('div', undefined, 'side')
  result.append(hero, side)

  // Lookalikes: every other candidate and open warning, dangerous ones first.
  const others = [
    ...state.candidates.filter((c) => c.id !== top.id).map((c) => c.id),
    ...state.warnings,
  ].sort((x, y) => Number(isDangerousId(y)) - Number(isDangerousId(x)))
  if (others.length > 0) {
    side.append(el('h3', 'Kaksoisolennot ja muut vaihtoehdot'))
    const list = el('ul', undefined, 'lookalikes')
    for (const id of others) {
      const li = el('li')
      li.append(photo(id, 'thumb'))
      const text = el('div')
      text.append(el('strong', species.get(id)?.nimi ?? id))
      text.append(el('span', species.get(id)?.tieteellinen ?? '', 'latin'))
      const ob = badge(id)
      if (ob) text.append(ob)
      li.append(text)
      list.append(li)
    }
    side.append(list)
  }

  // How to make sure: the checks, one at a time.
  const check = done ? null : nextCheck(state, species)
  if (check) {
    const box = el('section', undefined, 'verify')
    box.append(el('h3', 'Näin varmistat lajin'))
    box.append(el('p', check.kysymys, 'question'))
    const art = checkPicture(check)
    if (art) {
      const figure = el('figure', undefined, 'check-figure')
      figure.innerHTML = art
      box.append(figure)
    }
    const answers = el('div', undefined, 'answers')
    for (const a of Object.keys(check.vastaukset)) {
      const button = el('button', a, 'answer')
      button.addEventListener('click', () => {
        result.classList.remove('enter')
        render(answer(state, check, a), raw)
      })
      answers.append(button)
    }
    const skipButton = el('button', 'En pysty tarkistamaan tätä', 'answer ghost')
    skipButton.addEventListener('click', () => {
      result.classList.remove('enter')
      render(skip(state, check), raw)
    })
    answers.append(skipButton)
    box.append(answers)
    side.append(box)
  } else if (others.some(isDangerousId)) {
    side.append(
      el('p', 'Vaarallisia kaksoisolentoja ei voi sulkea pois tällä sovelluksella. Varmista laji sieneuvojalta.', 'reminder'),
    )
  }

  const checked = outcome(state, species)
  if (checked.kind === 'fits' && checked.checked.length > 0) {
    const ul = el('ul', undefined, 'checked')
    for (const a of checked.checked) {
      const k = [...species.values()].flatMap((r) => r.tarkistukset).find((c) => c.id === a.check)
      ul.append(el('li', `${k?.kysymys ?? a.check} – ${a.answer}`))
    }
    side.append(el('h3', 'Tarkistamasi asiat'), ul)
  }

  side.append(el('p', REMINDER, 'reminder'), newPhotoButton())
  show('result')
}

function isDangerousId(id: string): boolean {
  const g = species.get(id)?.ryhma
  return g !== undefined && DANGEROUS.has(g)
}

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

async function identify(images: File[]) {
  if (images.length === 0) return
  const request = ++latest
  const minimum = wait(MIN_LOADING_MS)
  setPreview(images[0]!)
  // Results fade in once; re-renders after an answer do not hide anything again.
  result.classList.add('enter')
  show('loading')
  try {
    files ??= await loadFiles(base)
    const r = await classify(images)
    await minimum
    if (request !== latest) return
    if (r.kind !== 'result') throw new Error(r.kind === 'error' ? r.message : r.kind)
    const raw = new Map(files.labels.map((l, i) => [l.id, r.probabilities[i] ?? 0]))
    const first = start(r.probabilities, files.labels, species, files.calibration)
    render(first.kind === 'flow' ? first.state : null, raw)
  } catch (e) {
    await minimum
    if (request !== latest) return
    result.replaceChildren(el('h2', 'Tunnistus epäonnistui'), el('p', String(e)), newPhotoButton())
    show('result')
  }
}

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
for (const label of document.querySelectorAll<HTMLLabelElement>('.actions label')) {
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
  if (!e.dataTransfer?.types.includes('Files') || dialog.open || webcamDialog.open) return
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
  if (dialog.open || webcamDialog.open) return
  const images = Array.from(e.dataTransfer.files).filter(isImage)
  void identify(images)
})

// Pasting an image from the clipboard identifies it too.
window.addEventListener('paste', (e) => {
  // The warning has to be accepted first, and the webcam dialog covers the page.
  if (dialog.open || webcamDialog.open) return
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

$<HTMLDetailsElement>('#about').addEventListener(
  'toggle',
  async () => {
    const target = $('#photographers')
    try {
      const response = await fetch(`${base}attributions.json`)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const a: Attributions = await response.json()
      const intro = el('p', `Malli on opetettu ${a.images} kuvalla. Kiitos kaikille kuvaajille. Aineistot: `)
      a.downloads.forEach((d, i) => {
        const link = el('a', d.citation)
        link.href = `https://doi.org/${d.doi}`
        intro.append(link, i < a.downloads.length - 1 ? '; ' : '.')
      })
      const list = el('ul', undefined, 'photographers')
      for (const p of a.photographers) {
        list.append(el('li', `${p.name} (${p.images} kuva${p.images === 1 ? '' : 'a'}, ${p.licenses.join(', ')})`))
      }
      target.replaceChildren(intro, list)
    } catch (e) {
      target.replaceChildren(el('p', `Luettelon lataus epäonnistui: ${String(e)}`))
    }
  },
  { once: true },
)

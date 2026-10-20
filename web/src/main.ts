// The app: photos in, candidates and checks out. Everything runs on the device; no image
// or result is sent anywhere (hard rule 9).
import speciesRecords from '../../species/species.json'
import { loadFiles, type ModelFiles } from './modelFiles.ts'
import {
  DANGEROUS,
  answer,
  isDone,
  nextCheck,
  outcome,
  outcomeText,
  skip,
  speciesMap,
  start,
  type Check,
  type SpeciesRecord,
  type State,
} from './flow.ts'
import type { Request, Response } from './worker.ts'
import './style.css'

const species = speciesMap(speciesRecords as unknown as SpeciesRecord[])
const base = import.meta.env.BASE_URL

const app = document.querySelector<HTMLDivElement>('#app')!
app.innerHTML = `
  <header>
    <h1>Seeni</h1>
    <p class="tagline">Sienten tunnistuksen apuväline, kehitysversio</p>
  </header>
  <p class="warning" role="alert">
    Älä koskaan syö sientä tämän sovelluksen perusteella. Lajitiedot ovat vielä
    tarkistamattomia luonnoksia. Varmista tunnistus aina sieneuvojalta.
  </p>
  <section class="pick">
    <label class="button" for="photos">Ota tai valitse kuvia</label>
    <input id="photos" type="file" accept="image/*" capture="environment" multiple hidden />
    <p class="hint">Voit valita useita kuvia samasta sienestä: lakki ylhäältä, alapinta ja jalan tyvi.</p>
    <p id="status" class="status">Ladataan mallia…</p>
  </section>
  <section id="previews" class="previews"></section>
  <section id="result" class="result" aria-live="polite"></section>
  <footer>
    <p>Kuvat käsitellään vain tällä laitteella. Mitään ei lähetetä minnekään.</p>
  </footer>
`

const status = document.querySelector<HTMLParagraphElement>('#status')!
const input = document.querySelector<HTMLInputElement>('#photos')!
const previews = document.querySelector<HTMLElement>('#previews')!
const result = document.querySelector<HTMLElement>('#result')!

const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
let files: ModelFiles | null = null
let nextId = 1
const pending = new Map<number, (r: Response) => void>()

worker.onmessage = (event: MessageEvent<Response>) => {
  const r = event.data
  if (r.id === 0) {
    if (r.kind === 'ready') {
      const how = r.provider === 'webgpu' ? 'WebGPU' : 'WebAssembly'
      status.textContent = `Valmis (${how}). Toimii myös ilman verkkoa.`
    } else if (r.kind === 'error') {
      status.textContent = `Mallin lataus epäonnistui: ${r.message}`
    }
    return
  }
  pending.get(r.id)?.(r)
  pending.delete(r.id)
}

// A worker that fails to load or crashes would leave every request waiting forever.
function failAll(message: string) {
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

function el<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, cls?: string) {
  const e = document.createElement(tag)
  if (text !== undefined) e.textContent = text
  if (cls) e.className = cls
  return e
}

function name(id: string): string {
  const r = species.get(id)
  return r ? `${r.nimi} (${r.tieteellinen})` : id
}

function groupBadge(id: string): HTMLElement | null {
  const g = species.get(id)?.ryhma
  if (!g || !DANGEROUS.has(g)) return null
  return el('span', g, `badge ${g === 'esikäsiteltävä' ? 'pre' : 'danger'}`)
}

function findCheck(id: string): Check | undefined {
  for (const r of species.values()) {
    const c = r.tarkistukset.find((k) => k.id === id)
    if (c) return c
  }
  return undefined
}

function renderOutcome(state: State | null) {
  const done = outcome(state, species)
  for (const line of outcomeText(done, species)) result.append(el('p', line, 'outcome'))
  if (done.kind === 'fits' && done.checked.length > 0) {
    result.append(el('h3', 'Tarkistetut asiat'))
    const ul = el('ul')
    for (const a of done.checked) {
      ul.append(el('li', `${findCheck(a.check)?.kysymys ?? a.check} ${a.answer}`))
    }
    result.append(ul)
  }
}

function render(state: State | null) {
  result.replaceChildren()
  if (state === null || isDone(state, species)) {
    renderOutcome(state)
    return
  }
  result.append(el('h2', 'Ehdokkaat'))
  const list = el('ul', undefined, 'candidates')
  for (const c of [...state.candidates].sort((a, b) => b.probability - a.probability)) {
    const li = el('li')
    li.append(el('span', name(c.id), 'name'))
    const badge = groupBadge(c.id)
    if (badge) li.append(badge)
    li.append(el('span', `${Math.round(c.probability * 100)} %`, 'prob'))
    if (c.source === 'lookalike') li.append(el('span', 'kaksoisolento', 'note'))
    list.append(li)
  }
  result.append(list)
  if (state.warnings.length > 0) {
    result.append(el('h3', 'Avoimet varoitukset'))
    const w = el('ul', undefined, 'warnings')
    for (const id of state.warnings) {
      const li = el('li', name(id))
      const badge = groupBadge(id)
      if (badge) li.append(badge)
      w.append(li)
    }
    result.append(w)
  }
  const check = nextCheck(state, species)
  if (!check) return
  result.append(el('h2', 'Tarkista'))
  result.append(el('p', check.kysymys, 'question'))
  const answers = el('div', undefined, 'answers')
  for (const a of Object.keys(check.vastaukset)) {
    const b = el('button', a)
    b.addEventListener('click', () => render(answer(state, check, a)))
    answers.append(b)
  }
  const skipButton = el('button', 'En pysty tarkistamaan', 'secondary')
  skipButton.addEventListener('click', () => render(skip(state, check)))
  answers.append(skipButton)
  result.append(answers)
}

// Only the latest set of photos may show a result: an earlier one that finishes later is
// dropped, so the result on screen always belongs to the photos on screen.
let latest = 0

input.addEventListener('change', async () => {
  const images = Array.from(input.files ?? [])
  input.value = ''
  if (images.length === 0) return
  const request = ++latest
  for (const img of previews.querySelectorAll('img')) URL.revokeObjectURL(img.src)
  previews.replaceChildren(
    ...images.map((f) => {
      const img = el('img')
      img.src = URL.createObjectURL(f)
      img.alt = ''
      return img
    }),
  )
  result.replaceChildren(el('p', 'Tunnistetaan…'))
  try {
    files ??= await loadFiles(base)
    const r = await classify(images)
    if (request !== latest) return
    if (r.kind !== 'result') throw new Error(r.kind === 'error' ? r.message : r.kind)
    const first = start(r.probabilities, files.labels, species, files.calibration)
    render(first.kind === 'flow' ? first.state : null)
  } catch (e) {
    if (request === latest) result.replaceChildren(el('p', `Tunnistus epäonnistui: ${String(e)}`))
  }
})

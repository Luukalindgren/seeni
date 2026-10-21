// Pictures for the checks (#9): one small drawing per check id, showing where to look and
// what the answers look like, side by side. Drawn here as inline SVG, so they are our own
// work, cost almost nothing to precache and work offline. A drawing is a sketch of the
// feature, not of a species: the question and the answers in species.json stay the source.

import type { Check } from './flow.ts'
import { lang, t } from './i18n.ts'

// Colours of the "Metsänpohja" look (style.css), plus mushroom colours.
const INK = '#5e5549'
const CAP = '#b8875a'
const UNDER = '#efe3c8'
const STEM = '#fbf8f1'
const MOSS = '#33513f'

// One panel is 120 × 130: the drawing in the top 100, its caption below.
const W = 120
const H = 130

interface Panel {
  // The answer in species.json this panel shows; several panels may show one answer.
  answer: string
  caption: string
  body: string
}

function picture(panels: Panel[]): string {
  const cols = panels.length === 4 ? 2 : Math.min(panels.length, 3)
  const rows = Math.ceil(panels.length / cols)
  const english = lang() === 'en'
  const caption = (p: Panel) => (english ? CAPTION_EN[p.caption] ?? p.caption : p.caption)
  const parts = panels.map((p, i) => {
    const x = (i % cols) * W
    const y = Math.floor(i / cols) * H
    return `<g transform="translate(${x} ${y})">${p.body}<text x="60" y="117" text-anchor="middle" fill="${INK}" stroke="none">${caption(p)}</text></g>`
  })
  const label = t().pictureLabel(panels.map(caption).join(', '))
  return (
    `<svg class="check-art" viewBox="0 0 ${cols * W} ${rows * H}" role="img" aria-label="${label}" ` +
    `fill="none" stroke="${INK}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" ` +
    `font-family="inherit" font-size="12">${parts.join('')}</svg>`
  )
}

// --- Pieces, in panel coordinates ---

const stem = (top = 52, bottom = 96, fill = STEM) =>
  `<path d="M51 ${top} C50 ${(top + bottom) / 2} 48 ${bottom - 8} 47 ${bottom} H73 C72 ${bottom - 8} 70 ${(top + bottom) / 2} 69 ${top}" fill="${fill}"/>`

const capSide = (fill = CAP, edge = 52) => `<path d="M14 ${edge} Q60 0 106 ${edge} Z" fill="${fill}"/>`

// The underside seen from below: a disc around the stem.
function underside(fill: string, texture: string): string {
  return `<circle cx="60" cy="50" r="40" fill="${fill}"/>${texture}<circle cx="60" cy="50" r="10" fill="${STEM}"/>`
}

function poreDots(step: number, radius: number, colour: string): string {
  let out = ''
  for (let y = 12; y <= 88; y += step * 0.87) {
    const row = Math.round((y - 12) / (step * 0.87))
    for (let x = 22 + (row % 2) * (step / 2); x <= 98; x += step) {
      const d = Math.hypot(x - 60, y - 50)
      if (d < 37 && d > 13) out += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${radius}" fill="${colour}" stroke="none"/>`
    }
  }
  return out
}

function gillLines(count: number, colour: string, width = 1): string {
  let out = ''
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2
    const inner = i % 2 === 0 ? 11 : 26
    out += `<line x1="${(60 + Math.cos(a) * inner).toFixed(1)}" y1="${(50 + Math.sin(a) * inner).toFixed(1)}" x2="${(60 + Math.cos(a) * 39).toFixed(1)}" y2="${(50 + Math.sin(a) * 39).toFixed(1)}" stroke="${colour}" stroke-width="${width}"/>`
  }
  return out
}

const pores = (fill: string, dot: string, step = 6, r = 1.5) => underside(fill, poreDots(step, r, dot))
const gills = (fill: string, line = INK) => underside(fill, gillLines(48, line, 0.8))

// A cap seen from the side with gills below its edge, for checks done on the gills.
function gillsSide(cap = CAP): string {
  let lines = ''
  for (let x = 20; x <= 100; x += 5) lines += `<line x1="${x}" y1="52" x2="${60 + (x - 60) * 0.35}" y2="60" stroke-width="0.8"/>`
  return `${stem(58)}<path d="M18 52 L42 60 H78 L102 52 Z" fill="${UNDER}"/>${lines}${capSide(cap)}`
}

// A funnel-shaped vahvero from the side; `ridges` draws forking ridges down the stem.
function funnel(fill: string, ridges: boolean): string {
  let lines = ''
  if (ridges) {
    for (let i = 0; i < 7; i++) {
      const x = 22 + i * 12.5
      const end = 54 + (x - 60) * 0.12
      lines += `<path d="M${x} 33 Q${(x + end) / 2} 50 ${end} 70" stroke-width="1.4"/>`
      if (i % 2 === 1) lines += `<path d="M${(x * 0.6 + end * 0.4).toFixed(1)} 46 L${x + (x < 60 ? 6 : -6)} 34" stroke-width="1.2"/>`
    }
  }
  return `<path d="M12 30 Q24 24 36 31 Q48 37 60 30 Q72 24 84 31 Q96 37 108 30 L72 66 L70 96 H50 L48 66 Z" fill="${fill}"/>${lines}`
}

function morel(pits: boolean): string {
  let marks = ''
  if (pits) {
    for (let y = 18; y <= 62; y += 11) {
      const half = 10 + Math.min(y - 12, 70 - y) * 0.45
      for (let x = 60 - half; x <= 60 + half; x += 9) marks += `<rect x="${(x - 3).toFixed(1)}" y="${y - 4}" width="6" height="8" rx="2" fill="#6f4e2e" stroke="none"/>`
    }
  } else {
    marks =
      '<path d="M40 30 Q48 20 56 30 T72 30 T84 34 M36 46 Q44 36 52 46 T68 46 T86 48 M40 60 Q48 52 56 60 T72 60 T82 62" stroke="#6f2f1f" stroke-width="2"/>'
  }
  const shape = pits
    ? '<path d="M60 8 C86 14 88 66 80 72 H40 C32 66 34 14 60 8 Z" fill="#c19a62"/>'
    : '<path d="M60 14 C92 12 96 46 86 70 H34 C22 46 28 12 60 14 Z" fill="#8f3f28"/>'
  return `${stem(70, 96)}${shape}${marks}`
}

const arrow = (x1: number, y1: number, x2: number, y2: number) =>
  `<path d="M${x1} ${y1} L${x2} ${y2}" stroke="${MOSS}" stroke-width="2"/><circle cx="${x2}" cy="${y2}" r="2.5" fill="${MOSS}" stroke="none"/>`

const WARTS: [number, number][] = [
  [36, 40], [50, 32], [64, 30], [78, 34], [88, 44], [28, 47], [58, 40], [74, 44], [44, 46],
]
const warts = () => WARTS.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2.8" fill="${STEM}" stroke="none"/>`).join('')
const CLUSTER: [number, number][] = [
  [40, 20], [56, 14], [72, 18], [86, 26],
]

const soil = '<path d="M4 80 Q30 76 60 80 T116 80 V100 H4 Z" fill="#d9c7a4" stroke="none"/>'

// The captions in English, by the Finnish caption (#52).
export const CAPTION_EN: Record<string, string> = {
  'aivomainen': 'like a brain',
  'ei muutu': 'no change',
  'ei nestettä': 'no milk',
  'ei rengasta': 'no ring',
  'ei suomuja': 'no scales',
  'ei tappeja, ei rengasta': 'no warts, no ring',
  'ei verkkoa': 'no net',
  'harjut, poimut': 'ridges, folds',
  'harmaanruskea': 'greyish brown',
  'heltat': 'gills',
  'isoja, kulmikkaita': 'large, angular',
  'kaksivärinen': 'two-coloured',
  'kannolla, ryhmänä': 'clustered on wood',
  'kellertävät, ruoste': 'yellowish, rust',
  'keltainen, oliivi': 'yellow, olive',
  'kenno tai poimuja': 'honeycomb or folds',
  'kennomainen': 'honeycomb',
  'kiinni vain huipusta': 'joined at the top',
  'kuitujuovainen': 'fibrous',
  'lähes sileä': 'almost smooth',
  'maassa': 'on the ground',
  'monta kammiota': 'many chambers',
  'murtuu kuin liitu': 'snaps like chalk',
  'ohuet heltat': 'thin gills',
  'ontto, uurteinen': 'hollow, grooved',
  'oranssi, liha tummuu': 'orange, darkens',
  'oranssia': 'orange',
  'paksu mukula': 'thick bulb',
  'paksut harjut': 'thick ridges',
  'pieniä, tiheitä': 'small, crowded',
  'piikit': 'spines',
  'pillistö': 'pores',
  'pinkki, suklaa': 'pink, chocolate',
  'punainen, tapit': 'red, warts',
  'pussimainen tuppi': 'sac-like volva',
  'rengas': 'ring',
  'rengas, kuurainen': 'ring, frosted',
  'repeää kuituisena': 'tears into fibres',
  'rikinkeltaiset': 'sulphur yellow',
  'ruosteenruskea': 'rust brown',
  'ruskea, tapit': 'brown, warts',
  'sileä reuna': 'smooth edge',
  'suklaa, violetinmusta': 'dark brown, violet',
  'suomuinen, tumma': 'scaly, dark',
  'tavallinen tyvi': 'plain base',
  'tumma verkko': 'dark net',
  'tummat suomut': 'dark scales',
  'tummuu ruskeaksi': 'turns brown',
  'umpinainen': 'solid',
  'vaalea verkko': 'pale net',
  'vaaleanpunainen': 'pink',
  'valkoinen, harmaa': 'white, grey',
  'valkoinen, okra': 'white, ochre',
  'valkoiset, kerma': 'white, cream',
  'valkoista': 'white',
  'vesikirkasta': 'clear',
  'villava reuna': 'woolly edge',
  'yksi ontelo': 'one hollow',
  'yksivärinen': 'one colour',
}

// --- The pictures, by check id ---

const PICTURES: Record<string, Panel[]> = {
  alapinta: [
    { answer: 'pillistö (sienimäinen, pienet reiät)', caption: 'pillistö', body: pores('#e7d27e', '#9a8338') },
    {
      answer: 'piikit', caption: 'piikit',
      body: `${stem(50)}${Array.from({ length: 15 }, (_, i) => 19 + i * 5.6)
        .map((x) => `<path d="M${x} 50 L${x + 2.2} 61 L${x + 4.4} 50" fill="${UNDER}" stroke-width="0.9"/>`)
        .join('')}${capSide('#e2c79a')}`,
    },
    { answer: 'heltat (ohuet levyt)', caption: 'heltat', body: gills('#f3ead6') },
    { answer: 'matalat, haarovat harjut tai poimut', caption: 'harjut, poimut', body: funnel('#e9b949', true) },
    { answer: 'lähes sileä', caption: 'lähes sileä', body: funnel('#4a4040', false) },
    {
      answer: 'ei erillistä alapintaa: lakki on kennomainen tai poimuttunut', caption: 'kenno tai poimuja',
      body: `<g transform="translate(-6 16) scale(0.62)">${morel(true)}</g><g transform="translate(52 16) scale(0.62)">${morel(false)}</g>`,
    },
  ],
  'pillisto-vari': [
    { answer: 'valkoinen tai vaalean harmaa', caption: 'valkoinen, harmaa', body: pores('#efede7', '#b9b4aa') },
    { answer: 'vaaleanpunainen', caption: 'vaaleanpunainen', body: pores('#e9bdb3', '#b9877c') },
    { answer: 'keltainen, vihertävä tai oliivi', caption: 'keltainen, oliivi', body: pores('#c8c45a', '#86812c') },
  ],
  'jalan-verkko': [
    { answer: 'vaalea verkko', caption: 'vaalea verkko', body: netStem('#a77c52', '#f6efe2') },
    { answer: 'tumma, ruskea verkko', caption: 'tumma verkko', body: netStem('#efe3c8', '#6b4a2d') },
    { answer: 'ei verkkoa', caption: 'ei verkkoa', body: netStem('#efe3c8', null) },
  ],
  'jalan-nukka': [
    { answer: 'kyllä', caption: 'tummat suomut', body: scaberStem(true) },
    { answer: 'ei', caption: 'ei suomuja', body: scaberStem(false) },
  ],
  'punikki-vai-lehmantatti': [
    { answer: 'kyllä', caption: 'oranssi, liha tummuu', body: cutBolete('#c8642c', '#7f8a9c') },
    { answer: 'ei, lakki harmaanruskea', caption: 'harmaanruskea', body: cutBolete('#8b6f55', '#fbf8f1') },
  ],
  'suillus-rengas': [
    { answer: 'kyllä', caption: 'rengas', body: `${stem(50)}<path d="M50 64 Q60 74 70 64 L73 70 Q60 80 47 70 Z" fill="#e9e1cf"/>${capSide('#8a5a33')}${arrow(96, 80, 74, 70)}` },
    { answer: 'ei', caption: 'ei rengasta', body: `${stem(50)}${capSide('#a77445')}` },
  ],
  'suillus-pillit': [
    { answer: 'isoja ja kulmikkaita', caption: 'isoja, kulmikkaita', body: underside('#c9a95a', bigPores()) },
    { answer: 'pieniä ja tiheitä', caption: 'pieniä, tiheitä', body: pores('#d9bd5e', '#93772c', 5, 1.2) },
  ],
  itiopoly: [
    { answer: 'valkoinen, kerma tai vaalea okra', caption: 'valkoinen, okra', body: sporePrint('#efe0bf') },
    { answer: 'ruosteenruskea tai kellanruskea', caption: 'ruosteenruskea', body: sporePrint('#a5602a') },
    { answer: 'tumma suklaanruskea tai violetinmusta', caption: 'suklaa, violetinmusta', body: sporePrint('#3b2a33') },
  ],
  maitiaisneste: [
    { answer: 'valkoista', caption: 'valkoista', body: milk('#ffffff') },
    { answer: 'oranssia tai porkkananpunaista', caption: 'oranssia', body: milk('#e8742c', '#a14c14') },
    { answer: 'vesikirkasta', caption: 'vesikirkasta', body: milk('#dcecf2', '#7fa4b3') },
    { answer: 'ei tule nestettä', caption: 'ei nestettä', body: milk(null) },
  ],
  'lakin-reuna-karvainen': [
    { answer: 'kyllä, selvästi villava', caption: 'villava reuna', body: capMargin(true) },
    { answer: 'ei', caption: 'sileä reuna', body: capMargin(false) },
  ],
  'heltat-tummuvat': [
    { answer: 'kyllä', caption: 'tummuu ruskeaksi', body: `${gillsSide('#9a7a4c')}<ellipse cx="74" cy="57" rx="8" ry="3.5" fill="#6b4024" stroke="none"/>${arrow(100, 82, 76, 60)}` },
    { answer: 'ei', caption: 'ei muutu', body: `${gillsSide('#9a7a4c')}${arrow(100, 82, 76, 60)}` },
  ],
  tyvi: [
    { answer: 'kyllä', caption: 'pussimainen tuppi', body: base('volva') },
    { answer: 'kyllä', caption: 'paksu mukula', body: base('bulb') },
    { answer: 'ei', caption: 'tavallinen tyvi', body: base('plain') },
  ],
  'liitumainen-jalka': [
    {
      answer: 'murtuu kuin liitu', caption: 'murtuu kuin liitu',
      body: `<path d="M48 14 H72 V50 L60 52 L48 50 Z" fill="${STEM}"/><path d="M48 60 L60 58 L72 60 V96 H48 Z" fill="${STEM}"/>`,
    },
    {
      answer: 'repeää kuituisena', caption: 'repeää kuituisena',
      body: `<path d="M48 14 H72 V48 L69 56 L66 49 L63 57 L60 49 L57 56 L54 49 L51 55 L48 48 Z" fill="${STEM}"/><path d="M48 66 L51 58 L54 65 L57 57 L60 65 L63 58 L66 65 L69 57 L72 66 V96 H48 Z" fill="${STEM}"/>`,
    },
  ],
  'punainen-lakki-valkoiset-tapit': [
    {
      answer: 'kyllä', caption: 'punainen, tapit',
      body: `${stem(50)}<path d="M51 64 Q60 72 69 64 L71 69 Q60 77 49 69 Z" fill="${STEM}"/>${capSide('#c8321f')}${warts()}`,
    },
    {
      answer: 'kyllä', caption: 'ruskea, tapit',
      body: `${stem(50)}<path d="M51 64 Q60 72 69 64 L71 69 Q60 77 49 69 Z" fill="${STEM}"/>${capSide('#8a6a45')}${warts()}`,
    },
    { answer: 'ei', caption: 'ei tappeja, ei rengasta', body: `${stem(50)}${capSide('#c8321f')}` },
  ],
  'kasvualusta-puu': [
    {
      answer: 'kyllä', caption: 'kannolla, ryhmänä',
      body: `<path d="M24 98 V62 Q60 54 96 62 V98 Z" fill="#9a7650"/><ellipse cx="60" cy="62" rx="36" ry="7" fill="#c7a77c"/>${CLUSTER.map(
          ([x, y]) =>
            `<path d="M${x - 2} ${y + 12} Q${x} ${y + 26} ${x + (x - 60) * 0.1} 60 H${x + 4 + (x - 60) * 0.1} Q${x + 3} ${y + 26} ${x + 3} ${y + 12}" fill="${STEM}" stroke-width="1.2"/><path d="M${x - 11} ${y + 12} Q${x} ${y - 6} ${x + 12} ${y + 12} Z" fill="#c08a45" stroke-width="1.2"/>`,
        )
        .join('')}`,
    },
    { answer: 'ei, maassa', caption: 'maassa', body: `${soil}${stem(50, 84)}${capSide('#b8875a')}` },
  ],
  'kalvorengas-seitikki': [
    {
      answer: 'kyllä', caption: 'rengas, kuurainen',
      body: `${stem(50)}<path d="M50 62 Q60 70 70 62 L72 67 Q60 75 48 67 Z" fill="#ffffff"/>${capSide('#c7a15f')}<path d="M30 40 Q38 34 44 40 M50 28 Q56 22 62 28 M68 32 Q76 28 82 36 M40 48 Q50 44 58 48" stroke="#f4ecdc" stroke-width="2"/>${arrow(98, 82, 73, 67)}`,
    },
    { answer: 'ei', caption: 'ei rengasta', body: `${stem(50)}${capSide('#c7a15f')}` },
  ],
  'harjut-vai-heltat': [
    { answer: 'paksuja ja matalia harjuja', caption: 'paksut harjut', body: underside('#e9b949', ridgeLines()) },
    { answer: 'ohuita ja tiheitä heltoja', caption: 'ohuet heltat', body: underside('#f0a33a', gillLines(72, '#a5591a', 0.7)) },
  ],
  'suppilo-ontto-jalka': [
    {
      answer: 'kyllä', caption: 'ontto, uurteinen',
      body: `<ellipse cx="60" cy="50" rx="30" ry="18" fill="#c9a04a"/><path d="M60 32 V40" /><ellipse cx="60" cy="52" rx="17" ry="8" fill="#3c3128"/>`,
    },
    { answer: 'ei, umpinainen', caption: 'umpinainen', body: `<circle cx="60" cy="50" r="22" fill="#c9a04a"/><circle cx="60" cy="50" r="17" fill="${STEM}"/>` },
  ],
  halkaisu: [
    {
      answer: 'yksi yhtenäinen ontelo, lakki kiinni jalassa', caption: 'yksi ontelo',
      body: `<path d="M60 8 C86 14 88 66 80 72 L76 96 H44 L40 72 C32 66 34 14 60 8 Z" fill="#c19a62"/><path d="M60 16 C78 22 78 62 72 70 L69 92 H51 L48 70 C42 62 42 22 60 16 Z" fill="${STEM}"/>`,
    },
    {
      answer: 'lakki kiinni vain jalan huipusta, jalka täynnä pumpulia', caption: 'kiinni vain huipusta',
      body: `<path d="M60 8 C84 10 86 44 82 54 H38 C34 44 36 10 60 8 Z" fill="#a8743f"/><path d="M60 14 C78 16 79 44 77 54 H43 C41 44 42 16 60 14 Z" fill="#ffffff"/><path d="M52 16 Q60 12 68 16 V96 H52 Z" fill="#f4efe4"/>${cotton()}`,
    },
    {
      answer: 'poimuinen, monta kammiota', caption: 'monta kammiota',
      body: `<path d="M60 14 C92 12 96 46 86 70 L76 96 H44 L34 70 C22 46 28 12 60 14 Z" fill="#8f3f28"/><path d="M40 30 Q48 22 56 32 Q50 42 42 40 Z M62 24 Q76 22 80 34 Q70 40 64 34 Z M38 52 Q46 46 52 54 Q46 62 40 60 Z M58 46 Q70 42 76 52 Q68 60 60 56 Z M48 74 Q56 70 62 76 L60 90 H50 Z" fill="${STEM}"/>`,
    },
  ],
  'lakin-pinta-kennot': [
    { answer: 'kennomainen', caption: 'kennomainen', body: morel(true) },
    { answer: 'aivomainen', caption: 'aivomainen', body: morel(false) },
  ],
  'heltojen-vari-vaalea': [
    { answer: 'valkoiset tai kermanväriset', caption: 'valkoiset, kerma', body: gills('#f7f2e6') },
    { answer: 'vaaleanpunaiset tai suklaanruskeat', caption: 'pinkki, suklaa', body: gills('#b4796a') },
    { answer: 'rikinkeltaiset tai vihertävät', caption: 'rikinkeltaiset', body: gills('#d8d24a', '#7d7a20') },
    { answer: 'kellertävät tai ruosteenruskeat', caption: 'kellertävät, ruoste', body: gills('#b06d2c', '#6a3b12') },
  ],
  'puoliksi-kuivunut-lakki': [
    {
      answer: 'kyllä', caption: 'kaksivärinen',
      body: `<circle cx="60" cy="50" r="40" fill="#8a5a2b"/><circle cx="60" cy="50" r="24" fill="#d4ab6c" stroke="none"/><circle cx="60" cy="50" r="5" fill="#b07a3c" stroke="none"/>`,
    },
    { answer: 'ei', caption: 'yksivärinen', body: `<circle cx="60" cy="50" r="40" fill="#a5733d"/><circle cx="60" cy="50" r="5" fill="#8d5f2e" stroke="none"/>` },
  ],
  'jalka-suomuinen': [
    { answer: 'suomuinen ja tumma', caption: 'suomuinen, tumma', body: ringedStem(true) },
    { answer: 'hopeisen kuitujuovainen', caption: 'kuitujuovainen', body: ringedStem(false) },
  ],
}

function cotton(): string {
  let out = ''
  for (let y = 22; y <= 90; y += 6) {
    for (let x = 54 + (y % 4); x <= 66; x += 5) out += `<circle cx="${x}" cy="${y}" r="1.6" fill="#ddd3c0" stroke="none"/>`
  }
  return out
}

function netStem(colour: string, net: string | null): string {
  let mesh = ''
  if (net) {
    for (let row = 0; row <= 5; row++) {
      const y = 20 + row * 7
      for (let x = 49 + (row % 2) * 3.5; x <= 66; x += 7) {
        mesh += `<path d="M${x} ${y} l3.5 -3.5 l3.5 3.5 l-3.5 3.5 Z" stroke="${net}" stroke-width="1"/>`
      }
    }
  }
  return `<path d="M42 14 Q60 8 78 14 L80 92 Q60 100 40 92 Z" fill="${colour}"/>${mesh}<path d="M30 14 Q60 2 90 14" stroke-width="3" stroke="#8a6142"/>`
}

function scaberStem(scales: boolean): string {
  let marks = ''
  if (scales) {
    for (let row = 0; row <= 12; row++) {
      const y = 18 + row * 6
      for (let x = 46 + (row % 2) * 3; x <= 72; x += 7) marks += `<path d="M${x} ${y} l2 3" stroke="#2c241c" stroke-width="1.6"/>`
    }
  }
  return `<path d="M44 12 Q60 6 76 12 L78 92 Q60 100 42 92 Z" fill="#f2ede4"/>${marks}<path d="M28 12 Q60 0 92 12" stroke-width="3" stroke="#a5541f"/>`
}

function cutBolete(cap: string, flesh: string): string {
  return `<path d="M14 50 Q60 0 106 50 Z" fill="${cap}"/><path d="M22 48 Q60 10 98 48 Z" fill="${flesh}" stroke="none"/><path d="M50 50 C50 72 48 84 46 96 H74 C72 84 70 72 70 50 Z" fill="${flesh}"/><path d="M14 50 H106" stroke-width="2.5" stroke="#cdb68a"/>`
}

function bigPores(): string {
  let out = ''
  for (let row = 0; row <= 5; row++) {
    const y = 18 + row * 13
    for (let x = 26 + (row % 2) * 6; x <= 94; x += 12) {
      const d = Math.hypot(x - 60, y - 50)
      if (d < 34 && d > 15) out += `<path d="M${x - 4} ${y - 3} L${x + 1} ${y - 5} L${x + 5} ${y} L${x + 2} ${y + 5} L${x - 4} ${y + 3} Z" fill="#7d6422" stroke="none"/>`
    }
  }
  return out
}

function ridgeLines(): string {
  let out = ''
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2
    const c = Math.cos(a)
    const s = Math.sin(a)
    const b = a + 0.17
    out += `<path d="M${(60 + c * 12).toFixed(1)} ${(50 + s * 12).toFixed(1)} Q${(60 + c * 26).toFixed(1)} ${(50 + s * 26).toFixed(1)} ${(60 + c * 39).toFixed(1)} ${(50 + s * 39).toFixed(1)} M${(60 + c * 26).toFixed(1)} ${(50 + s * 26).toFixed(1)} L${(60 + Math.cos(b) * 39).toFixed(1)} ${(50 + Math.sin(b) * 39).toFixed(1)}" stroke="#a87411" stroke-width="2.6"/>`
  }
  return out
}

function sporePrint(colour: string): string {
  let rays = ''
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2
    rays += `<line x1="${(60 + Math.cos(a) * 8).toFixed(1)}" y1="${(50 + Math.sin(a) * 8).toFixed(1)}" x2="${(60 + Math.cos(a) * 32).toFixed(1)}" y2="${(50 + Math.sin(a) * 32).toFixed(1)}" stroke="${colour}" stroke-width="2.4"/>`
  }
  return `<rect x="14" y="8" width="46" height="84" fill="#ffffff"/><rect x="60" y="8" width="46" height="84" fill="#2a241d"/>${rays}`
}

function milk(colour: string | null, edge = INK): string {
  const drop = colour
    ? `<path d="M74 59 Q81 69 74 75 Q67 69 74 59 Z" fill="${colour}" stroke="${edge}" stroke-width="1"/>`
    : ''
  return `${gillsSide('#c7865a')}${drop}${arrow(104, 84, 78, 66)}`
}

function capMargin(woolly: boolean): string {
  let hairs = ''
  if (woolly) {
    for (let x = 18; x <= 102; x += 4) {
      const y = 52 + Math.sin(x) * 1.5
      hairs += `<path d="M${x} ${y} q${(x - 60) * 0.06} 6 ${(x - 60) * 0.04} 10" stroke="#f6e3d6" stroke-width="1.2"/>`
    }
  }
  const edge = woolly
    ? `<path d="M14 52 Q12 60 22 60 M106 52 Q108 60 98 60" stroke-width="3" stroke="#d98a73"/>`
    : ''
  return `${stem(54)}${capSide(woolly ? '#d98a73' : '#d4a089')}${edge}${hairs}`
}

function base(kind: 'volva' | 'bulb' | 'plain'): string {
  const stemPath =
    kind === 'bulb'
      ? `<path d="M52 30 V70 Q36 78 44 92 Q60 100 76 92 Q84 78 68 70 V30" fill="${STEM}"/>`
      : `<path d="M52 30 V92 H68 V30" fill="${STEM}"/>`
  const sack = kind === 'volva' ? `<path d="M46 72 Q42 96 60 96 Q78 96 74 72 L68 78 L64 70 L60 78 L56 70 L52 78 Z" fill="#f4efe4"/>` : ''
  return `${soil}${stemPath}${sack}<path d="M30 30 Q60 4 90 30 Z" fill="#c8c39a"/>`
}

function ringedStem(scales: boolean): string {
  let marks = ''
  for (let y = 54; y <= 92; y += 5) {
    marks += scales
      ? `<path d="M${50 + (y % 3)} ${y} l5 2 M${60 + (y % 4)} ${y + 2} l5 2" stroke="#4a3220" stroke-width="1.8"/>`
      : `<path d="M${52 + (y % 5)} ${y} v4 M${62 + (y % 3)} ${y + 1} v4" stroke="#c9c2b4" stroke-width="0.8"/>`
  }
  const fill = scales ? '#9a7550' : '#d9cbb4'
  return `<path d="M50 30 V96 H70 V30" fill="${fill}"/><path d="M50 30 V48 H70 V30" fill="#e6d5b6"/><path d="M48 48 H72 L70 52 H50 Z" fill="#c69c62"/>${marks}<path d="M24 30 Q60 4 96 30 Z" fill="#b9813f"/>`
}

// The picture of a check, its panels in the order of the check's answers. Nothing when the
// panels do not show exactly the check's answers: a picture of other answers would mislead.
export function checkPicture(check: Pick<Check, 'id' | 'vastaukset'>): string | undefined {
  const panels = PICTURES[check.id]
  if (!panels) return undefined
  const order = Object.keys(check.vastaukset)
  const shown = new Set(panels.map((p) => p.answer))
  if (shown.size !== order.length || order.some((a) => !shown.has(a))) return undefined
  return picture([...panels].sort((a, b) => order.indexOf(a.answer) - order.indexOf(b.answer)))
}

export const CHECK_PICTURE_IDS = Object.keys(PICTURES)

// Captions, for the tests: no text the app shows may state edibility (hard rule 8).
export const CHECK_PICTURE_CAPTIONS = Object.values(PICTURES).flatMap((ps) => ps.map((p) => p.caption))

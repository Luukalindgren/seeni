// Grass that sways in a slow, uneven wind and bends away from the mouse pointer: a strip
// along the bottom of the page on large screens.
// Purely decorative: drawn on a canvas, paused when the page is hidden or the grass is not
// shown, and drawn once without motion under prefers-reduced-motion.

interface Blade {
  x: number
  height: number
  width: number
  color: string
  phase: number
  bend: number
}

// Moss and grass greens, back layer lighter and fainter than the front one.
const BACK = ['rgb(157 176 159 / 0.3)', 'rgb(176 190 160 / 0.28)', 'rgb(140 165 140 / 0.26)']
const FRONT = ['rgb(51 81 63 / 0.34)', 'rgb(78 110 80 / 0.32)', 'rgb(96 124 82 / 0.3)', 'rgb(62 125 79 / 0.26)']
const STRONG_BACK = ['rgb(157 176 159 / 0.7)', 'rgb(176 190 160 / 0.65)', 'rgb(140 165 140 / 0.6)']
const STRONG_FRONT = ['rgb(51 81 63 / 0.75)', 'rgb(78 110 80 / 0.7)', 'rgb(96 124 82 / 0.65)', 'rgb(62 125 79 / 0.6)']

// The wind at time `t` (s) and page position `x` (px), as a lean in radians: two slow waves
// travelling across the page, so neighbours move together. Shared with the drop area.
export function windAt(t: number, x: number, phase = 0): number {
  return Math.sin(t * 0.7 - x * 0.004 + phase * 0.2) * 0.07 + Math.sin(t * 1.9 - x * 0.013) * 0.025
}

export interface GrassOptions {
  // Blade heights in px: the shortest and how much taller the tallest are.
  height: [number, number]
  // Sparser in the middle, so the centre of the page stays calm under the buttons.
  calmMiddle: boolean
  // How far the pointer reaches, in px.
  reach: number
  // Stronger colours, for grass on a white background.
  strong?: boolean
}

export interface Grass {
  setVisible(visible: boolean): void
  // A gust: stronger wind, e.g. while a photo is dragged over the drop area.
  setGust(gust: boolean): void
}

export function startGrass(canvas: HTMLCanvasElement, still: boolean, options: GrassOptions): Grass {
  const context = canvas.getContext('2d')
  if (!context) return { setVisible() {}, setGust() {} }
  const ctx = context
  let gust = 0
  let gustTarget = 0
  let blades: Blade[] = []
  let width = 0
  let height = 0
  // The pointer in canvas coordinates; far away until the mouse moves.
  let pointerX = -1e4
  let pointerY = -1e4
  let visible = false
  let frame = 0
  let last = 0
  let rect = canvas.getBoundingClientRect()

  function blade(x: number, front: boolean): Blade {
    const palette = options.strong ? (front ? STRONG_FRONT : STRONG_BACK) : front ? FRONT : BACK
    return {
      x,
      height: (options.height[0] + Math.random() * options.height[1]) * (front ? 0.75 : 1),
      width: 2 + Math.random() * (front ? 3 : 2.5),
      color: palette[Math.floor(Math.random() * palette.length)]!,
      phase: Math.random() * Math.PI * 2,
      bend: 0,
    }
  }

  function resize() {
    const ratio = Math.min(window.devicePixelRatio || 1, 2)
    width = canvas.clientWidth
    height = canvas.clientHeight
    canvas.width = Math.round(width * ratio)
    canvas.height = Math.round(height * ratio)
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
    rect = canvas.getBoundingClientRect()
    blades = []
    for (const front of [false, true]) {
      for (let x = 0; x < width; x += front ? 5 : 4) {
        const edge = Math.abs(x / width - 0.5) * 2
        if (options.calmMiddle && Math.random() > 0.2 + 0.8 * edge) continue
        blades.push(blade(x + Math.random() * 4, front))
      }
    }
  }

  function draw(time: number) {
    const t = time / 1000
    // Ease towards the target at the same speed whatever the refresh rate.
    const dt = last ? Math.min((time - last) / 1000, 0.1) : 1 / 60
    last = time
    const ease = still ? 1 : 1 - Math.pow(1 - 0.06, dt * 60)
    // A canvas measured while hidden had no size; grow the grass once it has one.
    if (canvas.clientWidth !== width || canvas.clientHeight !== height) resize()
    gust += (gustTarget - gust) * (1 - Math.pow(1 - 0.03, dt * 60))
    ctx.clearRect(0, 0, width, height)
    for (const b of blades) {
      // Wind: two slow waves travelling across the page, so neighbours move together.
      const wind = still ? 0 : windAt(t, b.x, b.phase) * (1 + gust * 3) + gust * 0.12
      // The pointer pushes nearby blades away; the push fades with distance.
      let push = 0
      const dx = b.x - pointerX
      const dy = height - b.height * 0.7 - pointerY
      const distance = Math.hypot(dx, dy)
      if (distance < options.reach) push = Math.sign(dx || 1) * (1 - distance / options.reach) ** 2 * 0.5
      b.bend += (wind + push - b.bend) * ease
      const tipX = b.x + Math.sin(b.bend) * b.height
      const tipY = height - Math.cos(b.bend) * b.height
      const midX = b.x + Math.sin(b.bend * 0.5) * b.height * 0.5
      const midY = height - b.height * 0.5
      ctx.beginPath()
      ctx.moveTo(b.x - b.width / 2, height)
      ctx.quadraticCurveTo(midX - b.width / 3, midY, tipX, tipY)
      ctx.quadraticCurveTo(midX + b.width / 3, midY, b.x + b.width / 2, height)
      ctx.closePath()
      ctx.fillStyle = b.color
      ctx.fill()
    }
  }

  function loop(time: number) {
    draw(time)
    frame = visible && !document.hidden ? requestAnimationFrame(loop) : 0
    if (frame === 0) last = 0
  }

  function run() {
    if (still) {
      draw(0)
      return
    }
    if (frame === 0 && visible && !document.hidden) frame = requestAnimationFrame(loop)
  }

  window.addEventListener('pointermove', (e) => {
    if (!visible || still) return
    pointerX = e.clientX - rect.left
    pointerY = e.clientY - rect.top
  })
  // The mouse left the window: nothing pushes the grass any more.
  document.documentElement.addEventListener('mouseleave', () => {
    pointerX = pointerY = -1e4
  })
  document.addEventListener('visibilitychange', run)
  // A canvas that is not fixed moves with the page.
  if (getComputedStyle(canvas).position !== 'fixed') {
    window.addEventListener(
      'scroll',
      () => {
        if (visible) rect = canvas.getBoundingClientRect()
      },
      { passive: true },
    )
  }
  // Regrow the grass only once a resize has settled, not on every step of a drag.
  let resizing = 0
  window.addEventListener('resize', () => {
    clearTimeout(resizing)
    resizing = window.setTimeout(() => {
      resize()
      if (still) draw(0)
    }, 200)
  })
  canvas.classList.add('on')
  resize()

  return {
    setVisible(v: boolean) {
      visible = v
      canvas.classList.toggle('visible', v)
      if (v && (canvas.clientWidth !== width || canvas.clientHeight !== height)) resize()
      else if (v) rect = canvas.getBoundingClientRect()
      run()
    },
    setGust(g: boolean) {
      gustTarget = g ? 1 : 0
    },
  }
}

// A little sky along the top of the page, to go with the grass at the bottom (grass.ts):
// a few clouds that hang down from the top edge and sway in the same
// slow wind, and a sun peeking in at the top right corner that turns slowly. The mouse
// pointer pushes the clouds aside and spins the sun faster, as it bends the grass. On phones
// everything is smaller, nothing follows the finger, and the frame rate is lower.
// Purely decorative: drawn on a canvas, paused when the page is hidden, and drawn once
// without motion under prefers-reduced-motion.

import { windAt } from './grass.ts'

interface Puff {
  dx: number // from the cloud's centre, px
  dy: number
  r: number
}

interface Cloud {
  x: number // share of the page width
  y: number // px from the top; above 0 only the cloud's lower part shows
  puffs: Puff[]
  phase: number
  shift: number // px, eased towards the wind and the pointer
}

// Opaque, so the outlines of the puffs inside the cloud are covered.
const CLOUD = '#fcfaf5'
const CLOUD_EDGE = 'rgb(157 176 159 / 0.35)'
const SUN = 'rgb(232 178 74 / 0.4)'
const RAY = 'rgb(232 178 74 / 0.3)'

export interface SkyOptions {
  // How far the pointer reaches, in px; 0 for none.
  reach: number
  // The size of the clouds and the sun, 1 on a large screen.
  scale: number
  // At most this many frames a second; the display's rate when not set.
  fps?: number
}

export interface Sky {
  setVisible(visible: boolean): void
  // New options, e.g. when the window becomes large.
  configure(options: SkyOptions): void
  // A gust: stronger wind, e.g. while a photo is dragged over the drop area.
  setGust(gust: boolean): void
}

function cloud(x: number, y: number, scale: number): Cloud {
  // A row of puffs, larger in the middle.
  const puffs: Puff[] = []
  const n = 5
  for (let i = 0; i < n; i++) {
    const middle = 1 - Math.abs(i / (n - 1) - 0.5) * 2
    puffs.push({
      dx: (i - (n - 1) / 2) * 26 * scale,
      dy: (Math.random() - 0.5) * 6 * scale,
      r: (20 + middle * 16 + Math.random() * 6) * scale,
    })
  }
  return { x, y, puffs, phase: Math.random() * Math.PI * 2, shift: 0 }
}

// Kept clear of the sun at the right.
function clouds(scale: number): Cloud[] {
  return [cloud(0.1, -6 * scale, scale), cloud(0.36, -18 * scale, 0.8 * scale), cloud(0.66, -10 * scale, 0.9 * scale)]
}

export function startSky(canvas: HTMLCanvasElement, still: boolean, initial: SkyOptions): Sky {
  const context = canvas.getContext('2d')
  if (!context) return { setVisible() {}, configure() {}, setGust() {} }
  const ctx = context
  let options = initial
  let sky = clouds(options.scale)
  let width = 0
  let height = 0
  let pointerX = -1e4
  let pointerY = -1e4
  let visible = false
  let frame = 0
  let last = 0
  let gust = 0
  let gustTarget = 0
  let angle = 0
  let spin = 0

  function resize() {
    const ratio = Math.min(window.devicePixelRatio || 1, 2)
    width = canvas.clientWidth
    height = canvas.clientHeight
    canvas.width = Math.round(width * ratio)
    canvas.height = Math.round(height * ratio)
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
  }

  // The sun's centre lies outside the page, so only a quarter of it shows.
  const sun = () => ({ x: width - 20 * options.scale, y: -20 * options.scale, r: 54 * options.scale })

  function nearness(x: number, y: number): number {
    const distance = Math.hypot(x - pointerX, y - pointerY)
    return distance < options.reach ? (1 - distance / options.reach) ** 2 : 0
  }

  function drawSun() {
    const { x, y, r } = sun()
    const k = options.scale
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(angle)
    ctx.fillStyle = RAY
    const rays = 12
    for (let i = 0; i < rays; i++) {
      const a = (i / rays) * Math.PI * 2
      const spread = Math.PI / rays / 2.4
      ctx.beginPath()
      ctx.moveTo(Math.cos(a - spread) * (r + 8 * k), Math.sin(a - spread) * (r + 8 * k))
      ctx.lineTo(Math.cos(a) * (r + (i % 2 ? 26 : 38) * k), Math.sin(a) * (r + (i % 2 ? 26 : 38) * k))
      ctx.lineTo(Math.cos(a + spread) * (r + 8 * k), Math.sin(a + spread) * (r + 8 * k))
      ctx.closePath()
      ctx.fill()
    }
    ctx.restore()
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fillStyle = SUN
    ctx.fill()
  }

  function drawCloud(c: Cloud, t: number) {
    const cx = c.x * width + c.shift
    ctx.beginPath()
    for (const p of c.puffs) {
      // Each puff breathes a little, out of step with the others.
      const bob = still ? 0 : Math.sin(t * 0.6 + c.phase + p.dx * 0.05) * 2
      ctx.moveTo(cx + p.dx + p.r, c.y + p.dy + bob)
      ctx.arc(cx + p.dx, c.y + p.dy + bob, p.r, 0, Math.PI * 2)
    }
    ctx.fillStyle = CLOUD
    ctx.strokeStyle = CLOUD_EDGE
    ctx.lineWidth = 1.5
    ctx.stroke()
    ctx.fill()
  }

  function draw(time: number) {
    const t = time / 1000
    const dt = last ? Math.min((time - last) / 1000, 0.1) : 1 / 60
    last = time
    const ease = still ? 1 : 1 - Math.pow(1 - 0.04, dt * 60)
    if (canvas.clientWidth !== width || canvas.clientHeight !== height) resize()
    gust += (gustTarget - gust) * (1 - Math.pow(1 - 0.03, dt * 60))
    ctx.clearRect(0, 0, width, height)

    // The sun turns slowly, faster while the pointer is near it, and slows down again after.
    const s = sun()
    const target = still ? 0 : 0.08 + nearness(s.x, s.y + s.r * 0.5) * 2.2 + gust * 0.4
    spin += (target - spin) * (1 - Math.pow(1 - 0.03, dt * 60))
    angle += spin * dt
    drawSun()

    for (const c of sky) {
      const cx = c.x * width
      // The same wind as the grass, as a drift of some pixels to and fro.
      const wind = still ? 0 : windAt(t * 0.6, cx, c.phase) * 260 * options.scale * (1 + gust * 2) + gust * 30 * options.scale
      // The pointer pushes the cloud away from it.
      const near = nearness(cx + c.shift, c.y + 20 * options.scale)
      const push = near * Math.sign(cx + c.shift - pointerX || 1) * 70
      c.shift += (wind + push - c.shift) * ease
      drawCloud(c, t)
    }
  }

  function loop(time: number) {
    // Skip a frame that comes too soon; a little slack keeps 30 fps on a 60 Hz display.
    if (!options.fps || !last || time - last >= 1000 / options.fps - 4) draw(time)
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
    if (!visible || still || !options.reach) return
    // Measured here: a canvas that is not fixed moves with the page.
    const rect = canvas.getBoundingClientRect()
    pointerX = e.clientX - rect.left
    pointerY = e.clientY - rect.top
  })
  document.documentElement.addEventListener('mouseleave', () => {
    pointerX = pointerY = -1e4
  })
  document.addEventListener('visibilitychange', run)
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
      if (v) resize()
      run()
    },
    configure(o: SkyOptions) {
      options = o
      sky = clouds(o.scale)
      pointerX = pointerY = -1e4
      resize()
      if (still) draw(0)
    },
    setGust(g: boolean) {
      gustTarget = g ? 1 : 0
    },
  }
}

// The drop area on large screens, drawn on a canvas: a round, softly wavy shape whose edge
// moves in the same slow wind as the grass, and a drawn mushroom inside it that sways from
// its stem base. The mouse pushes both a little, like the grass along the bottom of the page.
// Paused when the page or the home view is hidden; drawn once, still, under reduced motion.

import { windAt } from './grass.ts'

// Colours of the "Metsänpohja" look (style.css).
const CARD = [255, 255, 255]
const MOSS_SOFT = [233, 239, 230]
const LINE = 'rgb(224 214 197)'
const MOSS = '#33513f'
const CAP = '#efe3c8'
const STEM = '#fbf8f1'
// Room around the shape for its waves and shadow, in px.
const MARGIN = 28

export interface DropArt {
  setVisible(visible: boolean): void
  // While a photo is dragged over the page: a gust, and the shape turns moss green.
  setGust(gust: boolean): void
}

export function startDropArt(canvas: HTMLCanvasElement, still: boolean): DropArt {
  const context = canvas.getContext('2d')
  if (!context) return { setVisible() {}, setGust() {} }
  const ctx = context
  let width = 0
  let height = 0
  let visible = false
  let frame = 0
  let last = 0
  let gust = 0
  let gustTarget = 0
  // The pointer, raw and smoothed, in canvas coordinates; far away until the mouse moves.
  let pointerX = -1e4
  let pointerY = -1e4
  let softX = -1e4
  let softY = -1e4
  // The mushroom's bend in radians: positive leans right.
  let bend = 0

  function resize() {
    const ratio = Math.min(window.devicePixelRatio || 1, 2)
    width = canvas.clientWidth
    height = canvas.clientHeight
    canvas.width = Math.round(width * ratio)
    canvas.height = Math.round(height * ratio)
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
  }

  // Pushes a point away from the pointer; the push fades out at `reach` px.
  function away(x: number, y: number, reach: number, strength: number): [number, number] {
    const dx = x - softX
    const dy = y - softY
    const d = Math.hypot(dx, dy)
    if (d >= reach || d === 0) return [x, y]
    const k = (1 - d / reach) ** 2 * strength
    return [x + (dx / d) * k, y + (dy / d) * k]
  }

  function drawShape(t: number, cx: number, cy: number, r: number) {
    const lean = still ? 0 : windAt(t, cx) * (1 + gust * 2)
    ctx.beginPath()
    const steps = 160
    for (let i = 0; i <= steps; i++) {
      const a = (i / steps) * Math.PI * 2
      // Slow waves travel round the edge; they are small, so it still reads as a circle.
      const wave = still ? 0 : Math.sin(a * 5 + t * 0.8) * 2.6 + Math.sin(a * 8 - t * 1.25) * 1.6
      let x = cx + Math.cos(a) * (r + wave)
      let y = cy + Math.sin(a) * (r + wave)
      // The wind leans the top more than the bottom, like a plant rooted at its base.
      x += lean * 40 * ((cy + r - y) / (2 * r))
      ;[x, y] = away(x, y, 110, 13)
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.closePath()
    const [r0, g0, b0] = CARD
    const [r1, g1, b1] = MOSS_SOFT
    const mix = (a: number, b: number) => Math.round(a + (b - a) * gust)
    ctx.save()
    ctx.shadowColor = 'rgb(51 81 63 / 0.13)'
    ctx.shadowBlur = 40
    ctx.shadowOffsetY = 18
    ctx.fillStyle = `rgb(${mix(r0!, r1!)} ${mix(g0!, g1!)} ${mix(b0!, b1!)})`
    ctx.fill()
    ctx.restore()
    ctx.lineWidth = 1.5
    ctx.strokeStyle = gust > 0.5 ? MOSS : LINE
    ctx.stroke()
  }

  function drawMushroom(t: number, ease: number, cx: number, cy: number, r: number) {
    const baseX = cx
    const baseY = cy + r * 0.62
    const stemHeight = r * 0.4
    const capWidth = r * 0.84
    const capHeight = r * 0.4
    // Wind and pointer, eased like a grass blade.
    const wind = still ? 0 : windAt(t, cx) * 1.3 * (1 + gust * 2) + gust * 0.08
    let push = 0
    const dx = baseX - softX
    const dy = baseY - stemHeight - softY
    const d = Math.hypot(dx, dy)
    if (d < 150) push = Math.sign(dx || 1) * (1 - d / 150) ** 2 * 0.35
    bend += (wind + push - bend) * ease
    const topX = baseX + Math.sin(bend) * stemHeight
    const topY = baseY - Math.cos(bend) * stemHeight
    const midX = baseX + Math.sin(bend * 0.5) * stemHeight * 0.5
    const midY = baseY - stemHeight * 0.5

    ctx.lineWidth = 4
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    ctx.strokeStyle = MOSS

    // Stem: wider at the base, bending along a curve.
    const baseHalf = r * 0.13
    const topHalf = r * 0.09
    ctx.beginPath()
    ctx.moveTo(baseX - baseHalf, baseY)
    ctx.quadraticCurveTo(midX - (baseHalf + topHalf) / 2, midY, topX - topHalf, topY)
    ctx.lineTo(topX + topHalf, topY)
    ctx.quadraticCurveTo(midX + (baseHalf + topHalf) / 2, midY, baseX + baseHalf, baseY)
    ctx.closePath()
    ctx.fillStyle = STEM
    ctx.fill()
    ctx.stroke()

    // Cap: a dome on top of the stem, tilted as the stem leans.
    ctx.save()
    ctx.translate(topX, topY + capHeight * 0.12)
    ctx.rotate(bend)
    const w = capWidth / 2
    ctx.beginPath()
    ctx.moveTo(-w, 0)
    ctx.bezierCurveTo(-w, -capHeight * 1.25, w, -capHeight * 1.25, w, 0)
    // The underside curves up slightly towards the stem.
    ctx.quadraticCurveTo(0, -capHeight * 0.18, -w, 0)
    ctx.closePath()
    ctx.fillStyle = CAP
    ctx.fill()
    ctx.stroke()
    // A highlight and a few spots, as in the app icon.
    ctx.beginPath()
    ctx.moveTo(-w * 0.55, -capHeight * 0.55)
    ctx.quadraticCurveTo(-w * 0.35, -capHeight * 0.82, -w * 0.05, -capHeight * 0.86)
    ctx.stroke()
    ctx.fillStyle = MOSS
    for (const [sx, sy] of [
      [w * 0.25, -capHeight * 0.7],
      [w * 0.55, -capHeight * 0.42],
      [-w * 0.15, -capHeight * 0.4],
    ]) {
      ctx.beginPath()
      ctx.arc(sx!, sy!, r * 0.016, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
  }

  function draw(time: number) {
    if (canvas.clientWidth !== width || canvas.clientHeight !== height) resize()
    const t = time / 1000
    const dt = last ? Math.min((time - last) / 1000, 0.1) : 1 / 60
    last = time
    const ease = still ? 1 : 1 - Math.pow(1 - 0.06, dt * 60)
    gust += (gustTarget - gust) * (still ? 1 : 1 - Math.pow(1 - 0.05, dt * 60))
    // The pointer is followed smoothly, so the shape never jumps.
    const follow = still ? 1 : 1 - Math.pow(1 - 0.12, dt * 60)
    softX = softX < -1e3 || pointerX < -1e3 ? pointerX : softX + (pointerX - softX) * follow
    softY = softY < -1e3 || pointerY < -1e3 ? pointerY : softY + (pointerY - softY) * follow
    ctx.clearRect(0, 0, width, height)
    const cx = width / 2
    const cy = height / 2
    const r = Math.min(width, height) / 2 - MARGIN
    drawShape(t, cx, cy, r)
    drawMushroom(t, ease, cx, cy, r)
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
    // Measured here, as the area moves when the text around it changes.
    const rect = canvas.getBoundingClientRect()
    pointerX = e.clientX - rect.left
    pointerY = e.clientY - rect.top
  })
  document.documentElement.addEventListener('mouseleave', () => {
    pointerX = pointerY = -1e4
  })
  document.addEventListener('visibilitychange', run)

  return {
    setVisible(v: boolean) {
      visible = v
      run()
    },
    setGust(g: boolean) {
      gustTarget = g ? 1 : 0
      if (still) draw(0)
    },
  }
}

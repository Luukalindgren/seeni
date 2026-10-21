// A strip of grass and moss along the bottom of the home view on large screens. It sways in
// a slow, uneven wind and bends away from the mouse pointer. Purely decorative: drawn on a
// canvas behind the content, paused when the page is hidden, and drawn once without motion
// under prefers-reduced-motion.

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

export function startGrass(canvas: HTMLCanvasElement): { setVisible(visible: boolean): void } {
  const context = canvas.getContext('2d')
  if (!context) return { setVisible() {} }
  const ctx = context
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  let blades: Blade[] = []
  let width = 0
  let height = 0
  // The pointer in canvas coordinates; far away until the mouse moves.
  let pointerX = -1e4
  let pointerY = -1e4
  let visible = false
  let frame = 0

  function blade(x: number, front: boolean): Blade {
    const palette = front ? FRONT : BACK
    return {
      x,
      height: (front ? 24 : 34) + Math.random() * (front ? 56 : 70),
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
    blades = []
    // Denser towards the edges, so the middle of the page stays calm under the buttons.
    for (const front of [false, true]) {
      for (let x = 0; x < width; x += front ? 5 : 4) {
        const edge = Math.abs(x / width - 0.5) * 2
        if (Math.random() > 0.2 + 0.8 * edge) continue
        blades.push(blade(x + Math.random() * 4, front))
      }
    }
  }

  function draw(time: number) {
    const t = time / 1000
    ctx.clearRect(0, 0, width, height)
    for (const b of blades) {
      // Wind: two slow waves travelling across the page, so neighbours move together.
      const wind = still
        ? 0
        : Math.sin(t * 0.7 - b.x * 0.004 + b.phase * 0.2) * 0.07 + Math.sin(t * 1.9 - b.x * 0.013) * 0.025
      // The pointer pushes nearby blades away; the push fades with distance.
      let push = 0
      const dx = b.x - pointerX
      const dy = height - b.height * 0.7 - pointerY
      const distance = Math.hypot(dx, dy)
      if (distance < 120) push = Math.sign(dx || 1) * (1 - distance / 120) ** 2 * 0.5
      b.bend += (wind + push - b.bend) * (still ? 1 : 0.06)
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
  }

  function run() {
    if (still) {
      draw(0)
      return
    }
    if (frame === 0 && visible && !document.hidden) frame = requestAnimationFrame(loop)
  }

  window.addEventListener('pointermove', (e) => {
    const rect = canvas.getBoundingClientRect()
    pointerX = e.clientX - rect.left
    pointerY = e.clientY - rect.top
  })
  document.addEventListener('pointerleave', () => {
    pointerX = pointerY = -1e4
  })
  document.addEventListener('visibilitychange', run)
  window.addEventListener('resize', () => {
    resize()
    if (still) draw(0)
  })
  canvas.classList.add('on')
  resize()

  return {
    setVisible(v: boolean) {
      visible = v
      canvas.classList.toggle('visible', v)
      run()
    },
  }
}

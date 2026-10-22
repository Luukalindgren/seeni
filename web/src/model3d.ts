// A turnable 3D model of a species (#45), drawn with plain WebGL: no library, and nothing
// is loaded unless the species has a model. A model faces +z (glTF). A drawn model
// (seeni.models3d) turns all the way round; one made from a photo (TripoSR) sways around
// the photographed side, as its far side is guessed.
//
// mountModel() resolves once the model is on screen; it rejects when WebGL is missing or
// the file cannot be loaded or read, and the caller keeps the photo.

import { parseGlb, type Mesh } from './glb.ts'

const VERTEX = `
attribute vec3 position;
attribute vec3 normal;
attribute vec2 uv;
uniform mat4 projection;
uniform mat4 view;
varying vec3 vNormal;
varying vec2 vUv;
void main() {
  vNormal = mat3(view) * normal;
  vUv = uv;
  gl_Position = projection * view * vec4(position, 1.0);
}`

// The colours already carry their light, so the shading is gentle; the edges turning away
// darken a little, like a drawn contour.
const FRAGMENT = `
precision mediump float;
uniform sampler2D colour;
varying vec3 vNormal;
varying vec2 vUv;
void main() {
  vec3 n = normalize(vNormal);
  if (!gl_FrontFacing) n = -n;
  float light = 0.78 + 0.22 * max(dot(n, normalize(vec3(0.4, 0.7, 0.6))), 0.0);
  float rim = 1.0 - abs(n.z);
  light *= 1.0 - 0.32 * rim * rim * rim;
  gl_FragColor = vec4(texture2D(colour, vUv).rgb * light, 1.0);
}`

function shader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader {
  const s = gl.createShader(type)!
  gl.shaderSource(s, source)
  gl.compileShader(s)
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader')
  return s
}

function perspective(fovY: number, aspect: number, near: number, far: number): Float32Array {
  const f = 1 / Math.tan(fovY / 2)
  const m = new Float32Array(16)
  m[0] = f / aspect
  m[5] = f
  m[10] = (far + near) / (near - far)
  m[11] = -1
  m[14] = (2 * far * near) / (near - far)
  return m
}

/** Camera at `distance` looking at `centre`, after turning the model by yaw and pitch. */
function viewMatrix(yaw: number, pitch: number, distance: number, centre: number[]): Float32Array {
  const cy = Math.cos(yaw)
  const sy = Math.sin(yaw)
  const cp = Math.cos(pitch)
  const sp = Math.sin(pitch)
  const [x, y, z] = [centre[0] ?? 0, centre[1] ?? 0, centre[2] ?? 0]
  // Rx(pitch) * Ry(yaw), then translate by -centre and push back by distance; column-major.
  return new Float32Array([
    cy, sp * sy, -cp * sy, 0,
    0, cp, sp, 0,
    sy, -sp * cy, cp * cy, 0,
    -(cy * x + sy * z),
    -(sp * sy * x + cp * y - sp * cy * z),
    -(-cp * sy * x + sp * y + cp * cy * z) - distance,
    1,
  ])
}

async function loadMesh(url: string): Promise<{ mesh: Mesh; image: ImageBitmap | HTMLImageElement }> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${response.status}`)
  const mesh = parseGlb(await response.arrayBuffer())
  if (typeof createImageBitmap === 'function') return { mesh, image: await createImageBitmap(mesh.image) }
  const img = new Image()
  img.src = URL.createObjectURL(mesh.image)
  try {
    await img.decode()
  } finally {
    URL.revokeObjectURL(img.src)
  }
  return { mesh, image: img }
}

export interface ModelOptions {
  reducedMotion: boolean
  /** 'sway' around the front, or 'spin' all the way round, until touched. */
  motion: 'sway' | 'spin'
}

export interface ModelView {
  canvas: HTMLCanvasElement
  dispose(): void
}

/** Draw the model at `url` into a new canvas; the caller puts the canvas on the page. */
export async function mountModel(
  url: string,
  label: string,
  options: ModelOptions,
): Promise<ModelView> {
  const canvas = document.createElement('canvas')
  canvas.className = 'model3d'
  canvas.setAttribute('role', 'img')
  canvas.setAttribute('aria-label', label)
  canvas.tabIndex = 0
  // The file first, so a model that cannot load (offline) never takes a WebGL context.
  const { mesh, image } = await loadMesh(url)
  const gl = canvas.getContext('webgl', { antialias: true, alpha: true, premultipliedAlpha: true })
  if (!gl) throw new Error('no WebGL')
  try {
    return setup(canvas, gl, mesh, image, options)
  } catch (e) {
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    throw e
  }
}

function setup(
  canvas: HTMLCanvasElement,
  gl: WebGLRenderingContext,
  mesh: Mesh,
  image: ImageBitmap | HTMLImageElement,
  { reducedMotion, motion }: ModelOptions,
): ModelView {
  if (mesh.indices instanceof Uint32Array && !gl.getExtension('OES_element_index_uint')) {
    throw new Error('no 32-bit indices')
  }

  const program = gl.createProgram()!
  gl.attachShader(program, shader(gl, gl.VERTEX_SHADER, VERTEX))
  gl.attachShader(program, shader(gl, gl.FRAGMENT_SHADER, FRAGMENT))
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('link')
  gl.useProgram(program)

  const buffers: WebGLBuffer[] = []
  function attribute(name: string, data: Float32Array, size: number) {
    const b = gl!.createBuffer()!
    buffers.push(b)
    gl!.bindBuffer(gl!.ARRAY_BUFFER, b)
    gl!.bufferData(gl!.ARRAY_BUFFER, data, gl!.STATIC_DRAW)
    const loc = gl!.getAttribLocation(program, name)
    gl!.enableVertexAttribArray(loc)
    gl!.vertexAttribPointer(loc, size, gl!.FLOAT, false, 0, 0)
  }
  attribute('position', mesh.positions, 3)
  attribute('normal', mesh.normals, 3)
  attribute('uv', mesh.uvs, 2)
  const indexBuffer = gl.createBuffer()!
  buffers.push(indexBuffer)
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer)
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW)
  const indexType = mesh.indices instanceof Uint32Array ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT

  const texture = gl.createTexture()
  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, image)
  // WebGL 1 makes mipmaps only for power-of-two sizes.
  const pot = (n: number) => n > 0 && (n & (n - 1)) === 0
  if (pot(image.width) && pot(image.height)) {
    gl.generateMipmap(gl.TEXTURE_2D)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
  } else {
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  }
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  if ('close' in image) image.close()

  const uProjection = gl.getUniformLocation(program, 'projection')
  const uView = gl.getUniformLocation(program, 'view')
  gl.enable(gl.DEPTH_TEST)

  const [x0, y0, z0] = mesh.min
  const [x1, y1, z1] = mesh.max
  const centre = [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2]
  const radius = Math.hypot(x1 - x0, y1 - y0, z1 - z0) / 2
  const fov = 0.6
  const distance = (radius / Math.sin(fov / 2)) * 1.02
  let yaw = 0
  let pitch = 0.18
  let spinning = !reducedMotion
  let visible = false
  let frame = 0
  let last = 0

  function draw() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const w = Math.max(1, Math.round(canvas.clientWidth * dpr))
    const h = Math.max(1, Math.round(canvas.clientHeight * dpr))
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w
      canvas.height = h
    }
    gl!.viewport(0, 0, w, h)
    gl!.clearColor(0, 0, 0, 0)
    gl!.clear(gl!.COLOR_BUFFER_BIT | gl!.DEPTH_BUFFER_BIT)
    // Fit the bounding sphere whichever side of the canvas is shorter.
    const aspect = w / h
    const fovY = aspect >= 1 ? fov : 2 * Math.atan(Math.tan(fov / 2) / aspect)
    gl!.uniformMatrix4fv(uProjection, false, perspective(fovY, aspect, distance / 10, distance * 3))
    gl!.uniformMatrix4fv(uView, false, viewMatrix(yaw, pitch, distance, centre))
    gl!.drawElements(gl!.TRIANGLES, mesh.indices.length, indexType, 0)
  }

  // Until touched, the model turns slowly, or sways ±50° around the photographed side, the
  // side that is not guessed; dragging turns it all the way round.
  let swayTime = 0
  function tick(now: number) {
    frame = 0
    if (spinning && last) {
      swayTime += (now - last) / 1000
      yaw = motion === 'spin' ? swayTime * 0.45 : 0.87 * Math.sin(swayTime * 0.6)
    }
    last = now
    draw()
    if (spinning && visible) frame = requestAnimationFrame(tick)
  }
  function request() {
    if (!frame && visible) frame = requestAnimationFrame(tick)
  }
  function stopSpin() {
    spinning = false
    last = 0
  }

  let drag: { x: number; y: number; id: number } | null = null
  canvas.addEventListener('pointerdown', (e) => {
    // The sway stops on the first move: a touch that becomes a page scroll leaves it on.
    drag = { x: e.clientX, y: e.clientY, id: e.pointerId }
    canvas.setPointerCapture(e.pointerId)
  })
  canvas.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return
    stopSpin()
    yaw += ((e.clientX - drag.x) / Math.max(canvas.clientWidth, 1)) * Math.PI * 2
    pitch = Math.max(-0.6, Math.min(1.2, pitch + ((e.clientY - drag.y) / Math.max(canvas.clientHeight, 1)) * 2))
    drag.x = e.clientX
    drag.y = e.clientY
    request()
  })
  const end = () => {
    drag = null
  }
  canvas.addEventListener('pointerup', end)
  canvas.addEventListener('pointercancel', end)
  canvas.addEventListener('keydown', (e) => {
    const step = 0.2
    if (e.key === 'ArrowLeft') yaw -= step
    else if (e.key === 'ArrowRight') yaw += step
    else if (e.key === 'ArrowUp') pitch = Math.max(-0.6, pitch - step)
    else if (e.key === 'ArrowDown') pitch = Math.min(1.2, pitch + step)
    else return
    e.preventDefault()
    stopSpin()
    request()
  })

  const resize = new ResizeObserver(() => request())
  resize.observe(canvas)
  // The canvas is not on the page yet: nothing is drawn until it is seen.
  let attached = false
  const seen = new IntersectionObserver((entries) => {
    // The sheet or result was replaced: free the WebGL context, browsers keep only a few.
    if (canvas.isConnected) attached = true
    else if (attached) return view.dispose()
    visible = entries.some((e) => e.isIntersecting)
    last = 0
    if (visible) request()
  })
  seen.observe(canvas)

  const view: ModelView = {
    canvas,
    dispose() {
      if (frame) cancelAnimationFrame(frame)
      frame = 0
      visible = false
      resize.disconnect()
      seen.disconnect()
      for (const b of buffers) gl.deleteBuffer(b)
      gl.deleteTexture(texture)
      gl.deleteProgram(program)
      gl.getExtension('WEBGL_lose_context')?.loseContext()
    },
  }
  return view
}

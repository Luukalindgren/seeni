// A small reader for the species 3D models (#45): binary glTF with one textured primitive.
// Only what our own models use: float positions, normals and UVs, or the same quantized
// (KHR_mesh_quantization) with the node's translation and scale, uint16 or uint32 indices
// as triangles or one strip, and one embedded image. Anything else is an error, and the
// app shows the photo.

export interface Mesh {
  positions: Float32Array
  normals: Float32Array
  uvs: Float32Array
  indices: Uint16Array | Uint32Array
  /** The indices are one triangle strip (glTF mode 5), not a list of triangles. */
  strip: boolean
  min: [number, number, number]
  max: [number, number, number]
  image: Blob
}

interface Accessor {
  bufferView: number
  byteOffset?: number
  componentType: number
  normalized?: boolean
  count: number
  type: string
  min?: number[]
  max?: number[]
}

interface BufferView {
  byteOffset?: number
  byteLength: number
  byteStride?: number
}

const MAGIC = 0x46546c67
const JSON_CHUNK = 0x4e4f534a
const BIN_CHUNK = 0x004e4942
const SIZE: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3 }
const FLOAT = 5126
type Typed = typeof Float32Array | typeof Int8Array | typeof Uint8Array | typeof Int16Array | typeof Uint16Array
// Attribute components: their typed array and, for a normalized integer, the divisor that
// maps it to ±1 or 0..1.
const COMPONENT: Record<number, [Typed, number]> = {
  [FLOAT]: [Float32Array, 1],
  5120: [Int8Array, 127],
  5121: [Uint8Array, 255],
  5122: [Int16Array, 32767],
  5123: [Uint16Array, 65535],
}
const KNOWN_EXTENSIONS = new Set(['KHR_mesh_quantization'])

export function parseGlb(data: ArrayBuffer): Mesh {
  const view = new DataView(data)
  if (data.byteLength < 20 || view.getUint32(0, true) !== MAGIC || view.getUint32(4, true) !== 2) {
    throw new Error('not a glTF 2.0 binary')
  }
  let offset = 12
  let json: any = null
  let bin: ArrayBuffer | null = null
  while (offset + 8 <= data.byteLength) {
    const length = view.getUint32(offset, true)
    const type = view.getUint32(offset + 4, true)
    const start = offset + 8
    if (start + length > data.byteLength) throw new Error('truncated chunk')
    if (type === JSON_CHUNK) json = JSON.parse(new TextDecoder().decode(new Uint8Array(data, start, length)))
    else if (type === BIN_CHUNK) bin = data.slice(start, start + length)
    offset = start + length
  }
  if (!json || !bin) throw new Error('missing JSON or BIN chunk')
  for (const e of json.extensionsRequired ?? []) {
    if (!KNOWN_EXTENSIONS.has(e)) throw new Error(`unsupported extension ${e}`)
  }
  const buffer = bin
  const primitive = json.meshes?.[0]?.primitives?.[0]
  const mode = primitive?.mode ?? 4
  if (!primitive || (mode !== 4 && mode !== 5)) {
    throw new Error('expected one triangle or triangle strip primitive')
  }
  // The node that places the mesh: a quantized model scales its positions back here.
  const node = (json.nodes ?? []).find((n: any) => n.mesh === 0) ?? {}
  if (node.matrix || node.rotation) throw new Error('only translation and scale are supported')
  const translation: number[] = node.translation ?? [0, 0, 0]
  const scale: number[] = node.scale ?? [1, 1, 1]
  // The normals are used as they are, which holds only for one scale on every axis.
  if (scale.some((v) => v !== scale[0] || !(v > 0))) throw new Error('the node scale must be uniform')

  const views: BufferView[] = json.bufferViews
  const accessors: Accessor[] = json.accessors
  function bytes(index: number): { accessor: Accessor; start: number; stride?: number; end: number } {
    const accessor = accessors[index]
    const bufferView = accessor && views[accessor.bufferView]
    if (!accessor || !bufferView) throw new Error(`bad accessor ${index}`)
    const viewStart = bufferView.byteOffset ?? 0
    return {
      accessor,
      start: viewStart + (accessor.byteOffset ?? 0),
      stride: bufferView.byteStride,
      end: viewStart + bufferView.byteLength,
    }
  }
  /** An attribute as floats: float as it is, a normalized integer mapped to ±1 or 0..1. */
  function floats(index: number, type: string): Float32Array {
    const { accessor, start, stride, end } = bytes(index)
    const size = SIZE[type] ?? 0
    if (accessor.type !== type) throw new Error(`accessor ${index} is not ${type}`)
    const component = COMPONENT[accessor.componentType]
    const float = accessor.componentType === FLOAT
    if (!component || float === !!accessor.normalized) {
      throw new Error(`accessor ${index} is not float or normalized`)
    }
    const [Typed, divisor] = component
    const step = stride ?? size * Typed.BYTES_PER_ELEMENT
    if (step % Typed.BYTES_PER_ELEMENT || step < size * Typed.BYTES_PER_ELEMENT) {
      throw new Error(`accessor ${index} has a bad stride`)
    }
    const last = start + (accessor.count - 1) * step + size * Typed.BYTES_PER_ELEMENT
    if (start % Typed.BYTES_PER_ELEMENT || (accessor.count > 0 && last > end)) {
      throw new Error(`accessor ${index} does not fit its buffer view`)
    }
    const source = new Typed(buffer, start, (end - start) / Typed.BYTES_PER_ELEMENT | 0)
    const every = step / Typed.BYTES_PER_ELEMENT
    const lowest = float ? -Infinity : -1 // a signed integer's minimum is also -1
    const out = new Float32Array(accessor.count * size)
    for (let i = 0; i < accessor.count; i++) {
      for (let k = 0; k < size; k++) out[i * size + k] = Math.max(source[i * every + k]! / divisor, lowest)
    }
    return out
  }

  const attributes = primitive.attributes ?? {}
  if ([attributes.POSITION, attributes.NORMAL, attributes.TEXCOORD_0, primitive.indices].includes(undefined)) {
    throw new Error('expected POSITION, NORMAL, TEXCOORD_0 and indices')
  }
  const positions = floats(attributes.POSITION, 'VEC3')
  for (let i = 0; i < positions.length; i++) {
    positions[i] = positions[i]! * (scale[i % 3] ?? 1) + (translation[i % 3] ?? 0)
  }
  const normals = floats(attributes.NORMAL, 'VEC3')
  const uvs = floats(attributes.TEXCOORD_0, 'VEC2')
  const { accessor: ia, start: is, stride: istride, end: iend } = bytes(primitive.indices)
  const IndexArray = ia.componentType === 5125 ? Uint32Array : ia.componentType === 5123 ? Uint16Array : null
  if (!IndexArray) throw new Error('indices must be uint16 or uint32')
  if (istride || is % IndexArray.BYTES_PER_ELEMENT || is + ia.count * IndexArray.BYTES_PER_ELEMENT > iend) {
    throw new Error('the indices do not fit their buffer view')
  }
  const indices: Uint16Array | Uint32Array = new IndexArray(buffer, is, ia.count)
  const n = positions.length / 3
  if (normals.length / 3 !== n || uvs.length / 2 !== n) throw new Error('attribute counts differ')
  for (const i of indices) if (i >= n) throw new Error('index out of range')
  if (mode === 4 ? indices.length % 3 : indices.length < 3) throw new Error('bad index count')

  const min: [number, number, number] = [Infinity, Infinity, Infinity]
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < positions.length; i++) {
    const v = positions[i]!
    const k = i % 3
    if (v < min[k]!) min[k] = v
    if (v > max[k]!) max[k] = v
  }

  const textureIndex = json.materials?.[primitive.material ?? 0]?.pbrMetallicRoughness?.baseColorTexture?.index
  const imageIndex = json.textures?.[textureIndex ?? -1]?.source
  const image = json.images?.[imageIndex ?? -1]
  const imageView: BufferView | undefined = views[image?.bufferView]
  if (!image || !imageView) throw new Error('expected an embedded base colour image')
  const imageStart = imageView.byteOffset ?? 0
  const blob = new Blob([new Uint8Array(buffer, imageStart, imageView.byteLength)], {
    type: image.mimeType ?? 'image/jpeg',
  })

  return { positions, normals, uvs, indices, strip: mode === 5, min, max, image: blob }
}

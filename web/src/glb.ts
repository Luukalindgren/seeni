// A small reader for the species 3D models (#45): binary glTF with one textured primitive.
// Only what our own models use: float positions, normals and UVs, uint16 or uint32
// indices and one embedded image. Anything else is an error, and the app shows the photo.

export interface Mesh {
  positions: Float32Array
  normals: Float32Array
  uvs: Float32Array
  indices: Uint16Array | Uint32Array
  min: [number, number, number]
  max: [number, number, number]
  image: Blob
}

interface Accessor {
  bufferView: number
  byteOffset?: number
  componentType: number
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
  const buffer = bin
  const primitive = json.meshes?.[0]?.primitives?.[0]
  if (!primitive || primitive.mode !== undefined && primitive.mode !== 4) {
    throw new Error('expected one triangle primitive')
  }

  const views: BufferView[] = json.bufferViews
  const accessors: Accessor[] = json.accessors
  function bytes(index: number): { accessor: Accessor; start: number } {
    const accessor = accessors[index]
    const bufferView = accessor && views[accessor.bufferView]
    if (!accessor || !bufferView) throw new Error(`bad accessor ${index}`)
    if (bufferView.byteStride) throw new Error('interleaved buffers are not supported')
    return { accessor, start: (bufferView.byteOffset ?? 0) + (accessor.byteOffset ?? 0) }
  }
  function floats(index: number, type: string): Float32Array {
    const { accessor, start } = bytes(index)
    if (accessor.componentType !== 5126 || accessor.type !== type) {
      throw new Error(`accessor ${index} is not float ${type}`)
    }
    return new Float32Array(buffer, start, accessor.count * (SIZE[type] ?? 0))
  }

  const attributes = primitive.attributes ?? {}
  if ([attributes.POSITION, attributes.NORMAL, attributes.TEXCOORD_0, primitive.indices].includes(undefined)) {
    throw new Error('expected POSITION, NORMAL, TEXCOORD_0 and indices')
  }
  const positions = floats(attributes.POSITION, 'VEC3')
  const normals = floats(attributes.NORMAL, 'VEC3')
  const uvs = floats(attributes.TEXCOORD_0, 'VEC2')
  const { accessor: ia, start: is } = bytes(primitive.indices)
  let indices: Uint16Array | Uint32Array
  if (ia.componentType === 5125) indices = new Uint32Array(buffer, is, ia.count)
  else if (ia.componentType === 5123) indices = new Uint16Array(buffer, is, ia.count)
  else throw new Error('indices must be uint16 or uint32')
  const n = positions.length / 3
  if (normals.length / 3 !== n || uvs.length / 2 !== n) throw new Error('attribute counts differ')
  for (const i of indices) if (i >= n) throw new Error('index out of range')

  const pa = accessors[attributes.POSITION]
  const min = (pa?.min ?? [-1, -1, -1]) as [number, number, number]
  const max = (pa?.max ?? [1, 1, 1]) as [number, number, number]

  const textureIndex = json.materials?.[primitive.material ?? 0]?.pbrMetallicRoughness?.baseColorTexture?.index
  const imageIndex = json.textures?.[textureIndex ?? -1]?.source
  const image = json.images?.[imageIndex ?? -1]
  const imageView: BufferView | undefined = views[image?.bufferView]
  if (!image || !imageView) throw new Error('expected an embedded base colour image')
  const imageStart = imageView.byteOffset ?? 0
  const blob = new Blob([new Uint8Array(buffer, imageStart, imageView.byteLength)], {
    type: image.mimeType ?? 'image/jpeg',
  })

  return { positions, normals, uvs, indices, min, max, image: blob }
}

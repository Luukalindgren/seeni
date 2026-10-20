// A minimal .npy reader for the test fixtures: little-endian uint8 or float32, C order.

export interface Npy {
  shape: number[]
  data: Uint8Array | Float32Array
}

export function readNpy(bytes: Uint8Array): Npy {
  const magic = String.fromCharCode(...bytes.subarray(1, 6))
  if (bytes[0] !== 0x93 || magic !== 'NUMPY') throw new Error('not a .npy file')
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const major = bytes[6]
  const headerStart = major === 1 ? 10 : 12
  const headerLength = major === 1 ? view.getUint16(8, true) : view.getUint32(8, true)
  const header = new TextDecoder('latin1').decode(bytes.subarray(headerStart, headerStart + headerLength))
  if (!header.includes("'fortran_order': False")) throw new Error('only C order is supported')
  const shape = (header.match(/'shape': \(([^)]*)\)/)?.[1] ?? '')
    .split(',')
    .filter((s) => s.trim())
    .map(Number)
  const body = bytes.slice(headerStart + headerLength)
  if (header.includes("'|u1'")) return { shape, data: body }
  if (header.includes("'<f4'")) return { shape, data: new Float32Array(body.buffer, 0, body.byteLength / 4) }
  throw new Error(`unsupported dtype in ${header}`)
}

// Saving where a mushroom was found (#51): the photo's GPS position from its EXIF, and links
// that open it in a maps app, where the user can save it as a favourite. Pure functions, no
// DOM, unit tested in tests/place.test.ts. The position is read only when the user asks, and
// leaves the device only in a link the user opens (hard rule 9).

export interface Position {
  lat: number
  lon: number
}

// EXIF sits near the start of a JPEG; this much is enough to find it.
export const EXIF_BYTES = 256 * 1024

/** The GPS position in a JPEG's EXIF, or null when there is none (or the file is not a
 * JPEG: HEIC, PNG and camera frames have no position this can read). */
export function exifPosition(buffer: ArrayBuffer): Position | null {
  const view = new DataView(buffer)
  if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return null
  let offset = 2
  while (offset + 4 <= view.byteLength) {
    if (view.getUint8(offset) !== 0xff) return null
    const marker = view.getUint8(offset + 1)
    // Fill bytes before a marker, and markers without a length (TEM, RSTn).
    if (marker === 0xff) {
      offset++
      continue
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2
      continue
    }
    if (marker === 0xda) return null // start of scan: no EXIF before the image data
    const length = view.getUint16(offset + 2)
    if (length < 2) return null
    // APP1 with "Exif\0\0". The TIFF data is read only within this segment.
    if (marker === 0xe1 && length >= 8 && offset + 10 <= view.byteLength && view.getUint32(offset + 4) === 0x45786966 && view.getUint16(offset + 8) === 0) {
      const end = Math.min(view.byteLength, offset + 2 + length)
      return tiffPosition(new DataView(buffer, offset + 10, end - offset - 10))
    }
    offset += 2 + length
  }
  return null
}

function tiffPosition(view: DataView): Position | null {
  const tiff = 0
  try {
    const little = view.getUint16(tiff) === 0x4949
    const u16 = (at: number) => view.getUint16(tiff + at, little)
    const u32 = (at: number) => view.getUint32(tiff + at, little)
    if (u16(2) !== 42) return null
    const entries = (ifd: number) => {
      const out = new Map<number, { type: number; count: number; value: number }>()
      const n = u16(ifd)
      for (let i = 0; i < n; i++) {
        const e = ifd + 2 + i * 12
        out.set(u16(e), { type: u16(e + 2), count: u32(e + 4), value: e + 8 })
      }
      return out
    }
    const gpsPointer = entries(u32(4)).get(0x8825)
    if (!gpsPointer) return null
    const gps = entries(u32(gpsPointer.value))
    const ref = (tag: number) => {
      const e = gps.get(tag)
      return e ? String.fromCharCode(view.getUint8(tiff + e.value)) : ''
    }
    const degrees = (tag: number) => {
      const e = gps.get(tag)
      if (!e || e.type !== 5 || e.count !== 3) return null
      const at = u32(e.value)
      const part = (i: number) => {
        const den = u32(at + i * 8 + 4)
        return den === 0 ? NaN : u32(at + i * 8) / den
      }
      return part(0) + part(1) / 60 + part(2) / 3600
    }
    const lat = degrees(2)
    const lon = degrees(4)
    if (lat === null || lon === null || !Number.isFinite(lat) || !Number.isFinite(lon)) return null
    const position = { lat: ref(1) === 'S' ? -lat : lat, lon: ref(3) === 'W' ? -lon : lon }
    // 0,0 is what some cameras write when they have no fix.
    if (position.lat === 0 && position.lon === 0) return null
    if (Math.abs(position.lat) > 90 || Math.abs(position.lon) > 180) return null
    return position
  } catch {
    return null
  }
}

/** "Löytöpaikka 21.10.2026 (kantarelli?)": the name of the place. The species is the model's
 * guess, so it is marked as one: a saved spot must not read as a confirmed identification. */
export function placeLabel(nimi: string | null, date: Date): string {
  const day = `Löytöpaikka ${date.getDate()}.${date.getMonth() + 1}.${date.getFullYear()}`
  return nimi ? `${day} (${nimi}?)` : day
}

const coordinate = (x: number) => x.toFixed(6)

/** Apple Maps: on an iPhone this opens the Maps app at a dropped pin, ready to save. */
export function appleMapsUrl(p: Position, label: string): string {
  return `https://maps.apple.com/?ll=${coordinate(p.lat)},${coordinate(p.lon)}&q=${encodeURIComponent(label)}`
}

/** Google Maps: on Android this opens the Maps app at the place. */
export function googleMapsUrl(p: Position): string {
  return `https://www.google.com/maps/search/?api=1&query=${coordinate(p.lat)},${coordinate(p.lon)}`
}

// Saving where a mushroom was found (#51).
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { appleMapsUrl, exifPosition, googleMapsUrl, placeLabel } from '../src/place.ts'

/** A minimal JPEG with an EXIF GPS block, as a camera writes it. */
function jpegWithGps(lat: [number, number, number], latRef: string, lon: [number, number, number], lonRef: string, little = false) {
  const tiff = new DataView(new ArrayBuffer(128))
  const u16 = (at: number, v: number) => tiff.setUint16(at, v, little)
  const u32 = (at: number, v: number) => tiff.setUint32(at, v, little)
  tiff.setUint16(0, little ? 0x4949 : 0x4d4d)
  u16(2, 42)
  u32(4, 8)
  // IFD0: one entry, the pointer to the GPS IFD at 26.
  u16(8, 1)
  u16(10, 0x8825), u16(12, 4), u32(14, 1), u32(18, 26)
  u32(22, 0)
  // GPS IFD: LatRef, Lat, LonRef, Lon.
  u16(26, 4)
  const entry = (i: number, tag: number, type: number, count: number) => {
    const e = 28 + i * 12
    u16(e, tag), u16(e + 2, type), u32(e + 4, count)
    return e + 8
  }
  tiff.setUint8(entry(0, 1, 2, 2), latRef.charCodeAt(0))
  u32(entry(1, 2, 5, 3), 80)
  tiff.setUint8(entry(2, 3, 2, 2), lonRef.charCodeAt(0))
  u32(entry(3, 4, 5, 3), 104)
  u32(76, 0)
  const rational = (at: number, [d, m, s]: [number, number, number]) => {
    u32(at, d), u32(at + 4, 1), u32(at + 8, m), u32(at + 12, 1), u32(at + 16, Math.round(s * 100)), u32(at + 20, 100)
  }
  rational(80, lat)
  rational(104, lon)

  const out = new Uint8Array(2 + 4 + 6 + 128 + 2)
  const view = new DataView(out.buffer)
  view.setUint16(0, 0xffd8)
  view.setUint16(2, 0xffe1)
  view.setUint16(4, 2 + 6 + 128)
  out.set([0x45, 0x78, 0x69, 0x66, 0, 0], 6)
  out.set(new Uint8Array(tiff.buffer), 12)
  view.setUint16(140, 0xffd9)
  return out.buffer
}

describe('exifPosition', () => {
  it('reads the GPS position of a photo', () => {
    const p = exifPosition(jpegWithGps([60, 10, 12.5], 'N', [24, 56, 30], 'E'))!
    assert.ok(Math.abs(p.lat - (60 + 10 / 60 + 12.5 / 3600)) < 1e-6)
    assert.ok(Math.abs(p.lon - (24 + 56 / 60 + 30 / 3600)) < 1e-6)
  })

  it('reads little-endian EXIF and southern and western positions', () => {
    const p = exifPosition(jpegWithGps([33, 51, 0], 'S', [70, 40, 0], 'W', true))!
    assert.ok(p.lat < 0 && p.lon < 0)
  })

  it('gives null without a position, for a non-JPEG and for a 0,0 fix', () => {
    assert.equal(exifPosition(new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0, 2]).buffer), null)
    assert.equal(exifPosition(new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer), null)
    assert.equal(exifPosition(jpegWithGps([0, 0, 0], 'N', [0, 0, 0], 'E')), null)
  })

  it('gives null for a truncated file instead of throwing', () => {
    assert.equal(exifPosition(jpegWithGps([60, 0, 0], 'N', [24, 0, 0], 'E').slice(0, 60)), null)
  })
})

describe('links', () => {
  const p = { lat: 60.1701234, lon: 24.9412345 }

  it('names the place after the species and the day', () => {
    assert.equal(placeLabel('kantarelli', new Date(2026, 9, 21)), 'Kantarellipaikka 21.10.2026')
  })

  it('opens Apple Maps at a pin with the name, and Google Maps at the place', () => {
    assert.equal(appleMapsUrl(p, 'Kantarellipaikka 21.10.2026'), 'https://maps.apple.com/?ll=60.170123,24.941235&q=Kantarellipaikka%2021.10.2026')
    assert.equal(googleMapsUrl(p), 'https://www.google.com/maps/search/?api=1&query=60.170123,24.941235')
  })
})

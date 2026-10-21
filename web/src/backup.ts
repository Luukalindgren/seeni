// A backup file of the user's finds (finds.ts). The browser may clear a website's storage, so
// the list can be saved to a file and read back on this or another device. The file is made
// and read on the device only (hard rule 9): nothing is uploaded, the user keeps the file.

import type { Find, NewFind } from './finds.ts'
import type { Position } from './place.ts'

export const BACKUP_FORMAT = 'seeni-finds'
export const BACKUP_VERSION = 1
// A thumbnail is about 10 KB; this keeps a broken or wrong file from filling the storage.
const MAX_THUMB_BYTES = 2 * 1024 * 1024
const MAX_FINDS = 10_000

interface BackupFind {
  at: string
  speciesId: string | null
  position: Position | null
  fromPhoto: boolean
  thumb: string // data:image/jpeg;base64,…
}

export interface Backup {
  format: typeof BACKUP_FORMAT
  version: typeof BACKUP_VERSION
  saved: string
  finds: BackupFind[]
}

async function toDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return `data:${blob.type || 'image/jpeg'};base64,${btoa(binary)}`
}

function fromDataUrl(url: string): Blob | null {
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]*={0,2})$/.exec(url)
  if (!m || (m[2]!.length * 3) / 4 > MAX_THUMB_BYTES) return null
  const binary = atob(m[2]!)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: m[1] })
}

/** The finds as a backup object, oldest first. */
export async function makeBackup(finds: Find[], now = new Date()): Promise<Backup> {
  const ordered = [...finds].sort((a, b) => a.id - b.id)
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    saved: now.toISOString(),
    finds: await Promise.all(
      ordered.map(async (f) => ({
        at: f.at,
        speciesId: f.speciesId,
        position: f.position,
        fromPhoto: f.fromPhoto,
        thumb: await toDataUrl(f.thumb),
      })),
    ),
  }
}

/** The file name for a backup saved on `now`, e.g. seeni-loydot-2026-10-21.json. */
export function backupName(now = new Date()): string {
  const d = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  return `seeni-loydot-${d}.json`
}

function isPosition(p: unknown): p is Position {
  if (typeof p !== 'object' || p === null) return false
  const { lat, lon } = p as Record<string, unknown>
  return typeof lat === 'number' && typeof lon === 'number' && Math.abs(lat) <= 90 && Math.abs(lon) <= 180
}

/**
 * The finds in a backup file's text, in the file's order. Throws when the text is not a
 * backup of this format; leaves out single finds that are broken. The species id is kept as
 * it is: a find of a species the current app does not know is shown by its id.
 */
export function readBackup(text: string): NewFind[] {
  const data: unknown = JSON.parse(text)
  if (typeof data !== 'object' || data === null) throw new Error('not a backup')
  const { format, version, finds } = data as Record<string, unknown>
  if (format !== BACKUP_FORMAT || version !== BACKUP_VERSION || !Array.isArray(finds)) throw new Error('not a backup')
  const out: NewFind[] = []
  for (const f of finds.slice(0, MAX_FINDS) as unknown[]) {
    if (typeof f !== 'object' || f === null) continue
    const r = f as Record<string, unknown>
    if (typeof r.at !== 'string' || Number.isNaN(Date.parse(r.at))) continue
    const speciesId = r.speciesId === null ? null : typeof r.speciesId === 'string' && /^[a-z0-9-]{1,80}$/.test(r.speciesId) ? r.speciesId : undefined
    if (speciesId === undefined) continue
    const position = r.position === null ? null : isPosition(r.position) ? r.position : undefined
    if (position === undefined) continue
    const thumb = typeof r.thumb === 'string' ? fromDataUrl(r.thumb) : null
    if (!thumb) continue
    out.push({
      at: r.at,
      speciesId,
      position: position && { lat: position.lat, lon: position.lon },
      fromPhoto: r.fromPhoto === true,
      thumb,
    })
  }
  return out
}

/** The finds in `incoming` that are not already in `existing` (same time and species). */
export function newFinds(incoming: NewFind[], existing: Pick<Find, 'at' | 'speciesId'>[]): NewFind[] {
  const key = (f: Pick<Find, 'at' | 'speciesId'>) => `${f.at}|${f.speciesId ?? ''}`
  const seen = new Set(existing.map(key))
  return incoming.filter((f) => {
    const k = key(f)
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

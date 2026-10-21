// The user's own finds: a small log of identified mushrooms with a thumbnail, the suggested
// species, the date and the find spot, kept in IndexedDB on this device only (hard rule 9).
// Nothing here is sent anywhere, and the user can delete any entry. A find records what the
// app suggested, never that the mushroom was confirmed (hard rule 8): the list shows the
// species with a question mark and its danger label.

import type { Position } from './place.ts'

export interface Find {
  id: number
  at: string // ISO time of saving
  speciesId: string | null // null: "not sure"
  thumb: Blob
  position: Position | null
  fromPhoto: boolean
}
export type NewFind = Omit<Find, 'id'>

const DB = 'seeni'
const STORE = 'finds'

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true })
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open()
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode)
      const request = work(tx.objectStore(STORE))
      tx.oncomplete = () => resolve(request.result)
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })
  } finally {
    db.close()
  }
}

export async function addFind(find: NewFind): Promise<number> {
  return Number(await run('readwrite', (s) => s.add(find)))
}

export async function updateFind(find: Find): Promise<void> {
  await run('readwrite', (s) => s.put(find))
}

/** Every find, newest first. */
export async function listFinds(): Promise<Find[]> {
  const all = await run<Find[]>('readonly', (s) => s.getAll() as IDBRequest<Find[]>)
  return all.sort((a, b) => b.id - a.id)
}

export async function deleteFind(id: number): Promise<void> {
  await run('readwrite', (s) => s.delete(id))
}

export async function countFinds(): Promise<number> {
  return run('readonly', (s) => s.count())
}

/** A small JPEG of the photo for the list: the shorter side at `size` px, centre crop. */
export async function thumbnail(file: Blob, size = 160): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  try {
    const side = Math.min(bitmap.width, bitmap.height)
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = size
    const ctx = canvas.getContext('2d')!
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, size, size)
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('thumbnail'))), 'image/jpeg', 0.8),
    )
  } finally {
    bitmap.close()
  }
}

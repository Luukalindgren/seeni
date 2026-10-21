// Saving the find spot (#51): from the photo's EXIF position, or else the current location,
// read only on tap, and opened in Apple Maps or Google Maps.
import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const chanterelle = readFileSync(fileURLToPath(new URL('../public/species/cantharellus-cibarius.jpg', import.meta.url)))

/** The photo with an EXIF APP1 segment holding 61° 30' N, 23° 45' E, right after SOI. */
function withGps(jpeg: Buffer): Buffer {
  const t = Buffer.alloc(128)
  t.write('MM', 0, 'ascii')
  t.writeUInt16BE(42, 2)
  t.writeUInt32BE(8, 4)
  t.writeUInt16BE(1, 8)
  t.writeUInt16BE(0x8825, 10), t.writeUInt16BE(4, 12), t.writeUInt32BE(1, 14), t.writeUInt32BE(26, 18)
  t.writeUInt16BE(4, 26)
  const entry = (i: number, tag: number, type: number, count: number) => {
    const e = 28 + i * 12
    t.writeUInt16BE(tag, e), t.writeUInt16BE(type, e + 2), t.writeUInt32BE(count, e + 4)
    return e + 8
  }
  t.write('N', entry(0, 1, 2, 2), 'ascii')
  t.writeUInt32BE(80, entry(1, 2, 5, 3))
  t.write('E', entry(2, 3, 2, 2), 'ascii')
  t.writeUInt32BE(104, entry(3, 4, 5, 3))
  ;[61, 1, 30, 1, 0, 1].forEach((v, i) => t.writeUInt32BE(v, 80 + i * 4))
  ;[23, 1, 45, 1, 0, 1].forEach((v, i) => t.writeUInt32BE(v, 104 + i * 4))
  const app1 = Buffer.alloc(4 + 6)
  app1.writeUInt16BE(0xffe1, 0)
  app1.writeUInt16BE(2 + 6 + t.length, 2)
  app1.write('Exif\0\0', 4, 'binary')
  return Buffer.concat([jpeg.subarray(0, 2), app1, t, jpeg.subarray(2)])
}

async function identify(page: Page, buffer: Buffer) {
  await page.goto('http://localhost:4173/seeni/')
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Hyväksyn' }).click()
  await page.locator('#gallery').setInputFiles({ name: 'sieni.jpg', mimeType: 'image/jpeg', buffer })
  await expect(page.locator('#result h2').first()).toHaveText('kantarelli', { timeout: 60_000 })
}

test('uses the position in the photo', async ({ page }) => {
  await identify(page, withGps(chanterelle))
  await page.getByRole('button', { name: 'Tallenna löytöpaikka' }).click()
  await expect(page.locator('.place')).toContainText('Sijainti kuvasta')
  const apple = page.getByRole('link', { name: 'Avaa Apple Mapsissa' })
  await expect(apple).toHaveAttribute('href', /^https:\/\/maps\.apple\.com\/\?ll=61\.500000,23\.750000&q=L%C3%B6yt%C3%B6paikka%20\d+\.\d+\.\d{4}%20\(kantarelli%3F\)$/)
  await expect(page.getByRole('link', { name: 'Avaa Google Mapsissa' })).toHaveAttribute(
    'href',
    'https://www.google.com/maps/search/?api=1&query=61.500000,23.750000',
  )
  await page.getByRole('button', { name: 'Unohda sijainti' }).click()
  await expect(apple).toHaveCount(0)
})

test.describe('without a position in the photo', () => {
  test.use({ geolocation: { latitude: 60.2, longitude: 24.9 }, permissions: ['geolocation'] })

  test('falls back to the current location, asked for only on tap', async ({ page }) => {
    await page.addInitScript(() => {
      const real = navigator.geolocation.getCurrentPosition.bind(navigator.geolocation)
      ;(window as unknown as { asked: number }).asked = 0
      navigator.geolocation.getCurrentPosition = (...args) => {
        ;(window as unknown as { asked: number }).asked++
        real(...args)
      }
    })
    await identify(page, chanterelle)
    expect(await page.evaluate(() => (window as unknown as { asked: number }).asked)).toBe(0)
    await page.getByRole('button', { name: 'Tallenna löytöpaikka' }).click()
    await expect(page.locator('.place')).toContainText('Nykyinen sijaintisi')
    await expect(page.getByRole('link', { name: 'Avaa Google Mapsissa' })).toHaveAttribute('href', /query=60\.200000,24\.900000$/)
  })
})

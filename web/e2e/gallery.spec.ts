// Species gallery: a sheet shows more photos of the species, each credited, and the result
// links to it. The photos are fetched when shown, not precached.
import { expect, test } from '@playwright/test'
import { fileURLToPath } from 'node:url'

const chanterelle = fileURLToPath(new URL('../public/species/cantharellus-cibarius.jpg', import.meta.url))

test('the result opens the sheet with more photos of the species', async ({ page }) => {
  await page.goto('http://localhost:4173/seeni/')
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Hyväksyn' }).click()
  await page.locator('#gallery').setInputFiles(chanterelle)
  await expect(page.locator('#result h2').first()).toHaveText(/^kantarelli$/i, { timeout: 60_000 })

  await page.locator('#result').getByRole('button', { name: 'Lisää kuvia ja tuntomerkit' }).click()
  const strip = page.locator('#sheet').getByRole('group', { name: 'Lisää kuvia' })
  await expect(strip.locator('img')).toHaveCount(3)
  for (const img of await strip.locator('img').all()) {
    await img.scrollIntoViewIfNeeded()
    await expect(img).toHaveJSProperty('complete', true)
    expect(await img.evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(0)
  }
  for (const caption of await strip.locator('figcaption').allTextContents()) {
    expect(caption).toMatch(/^Kuva: .+, CC(0-1\.0|-BY-4\.0)$/)
  }
})

test('offline, a gallery seen before shows its photos, and one never seen shows none', async ({ page, context }) => {
  await page.goto('http://localhost:4173/seeni/')
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Hyväksyn' }).click()
  await expect(page.locator('#status')).toContainText('Valmis', { timeout: 100_000 })
  // Wait until the service worker controls the page, so it sees the photo requests.
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
    if (!navigator.serviceWorker.controller) {
      await new Promise((resolve) => navigator.serviceWorker.addEventListener('controllerchange', resolve))
    }
  })
  const open = async (search: string) => {
    if (!(await page.locator('#guide').isVisible())) await page.locator('#guide-open').click()
    await page.locator('#guide').getByRole('searchbox').fill(search)
    await page.locator('#guide .lookalike').click()
  }
  // Seen once online: the service worker caches the photos.
  await open('herkkutat')
  const strip = page.locator('#sheet .gallery')
  for (const img of await strip.locator('img').all()) {
    await img.scrollIntoViewIfNeeded()
    await expect(img).toHaveJSProperty('complete', true)
  }

  // The service worker keeps them (the browser's own cache could also serve a reload).
  await expect
    .poll(() => page.evaluate(async () => (await (await caches.open('species-gallery')).keys()).map((r) => r.url).sort()))
    .toEqual([1, 2, 3].map((n) => `http://localhost:4173/seeni/species/gallery/boletus-edulis-agg-${n}.jpg`))
  // setOffline does not reach the service worker's own fetches, so the photos' network
  // requests are refused instead: what shows must come from the cache.
  await context.route('**/species/gallery/**', (route) => route.abort('internetdisconnected'))
  await context.setOffline(true)
  await page.reload()
  await expect(page.locator('#status')).toContainText('Valmis', { timeout: 100_000 })
  await open('herkkutat')
  for (const img of await strip.locator('img').all()) {
    await img.scrollIntoViewIfNeeded()
    await expect(img).toHaveJSProperty('complete', true)
    expect(await img.evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(0)
  }
  await page.locator('#sheet-close').click()
  // Never seen: no broken photos and no empty heading.
  await open('kantar')
  await expect(page.locator('#sheet .gallery')).toHaveCount(0)
  await expect(page.locator('#sheet .gallery-title')).toHaveCount(0)
})

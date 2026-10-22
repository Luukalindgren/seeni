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
  await expect(strip.locator('img').first()).toHaveJSProperty('complete', true)
  expect(await strip.locator('img').first().evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(0)
  for (const caption of await strip.locator('figcaption').allTextContents()) {
    expect(caption).toMatch(/^Kuva: .+, CC(0-1\.0|-BY-4\.0)$/)
  }
})

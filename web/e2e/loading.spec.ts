// The first load shows how much of the model and the runtime has been downloaded.
import { expect, test } from '@playwright/test'
import { fileURLToPath } from 'node:url'

const chanterelle = fileURLToPath(new URL('../public/species/cantharellus-cibarius.jpg', import.meta.url))

test('shows the download progress of the model, then ready', async ({ page }) => {
  // Every text the status line shows, from the start.
  await page.addInitScript(() => {
    const seen: string[] = []
    ;(window as unknown as { statusTexts: string[] }).statusTexts = seen
    new MutationObserver(() => {
      const text = document.querySelector('#status')?.textContent
      if (text && seen[seen.length - 1] !== text) seen.push(text)
    }).observe(document, { subtree: true, childList: true, characterData: true })
  })
  await page.goto('http://localhost:4173/seeni/')
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Hyväksyn' }).click()
  await expect(page.locator('#status')).toContainText('Valmis', { timeout: 100_000 })
  const texts = await page.evaluate(() => (window as unknown as { statusTexts: string[] }).statusTexts)
  const percents = texts.flatMap((s) => /^Ladataan mallia… (\d+) %$/.exec(s)?.slice(1) ?? []).map(Number)
  expect(percents.length).toBeGreaterThan(1)
  expect(percents).toEqual([...percents].sort((a, b) => a - b))
  expect(Math.max(...percents)).toBeGreaterThan(50)
  expect(Math.max(...percents)).toBeLessThanOrEqual(99)
})

test('a photo chosen while the model downloads shows the download in the wait', async ({ page }) => {
  // Hold the model back until the photo has been chosen.
  let release!: () => void
  const held = new Promise<void>((resolve) => (release = resolve))
  await page.route('**/model.onnx', async (route) => {
    await held
    await route.continue()
  })
  await page.goto('http://localhost:4173/seeni/')
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Hyväksyn' }).click()
  await page.locator('#gallery').setInputFiles(chanterelle)
  await expect(page.locator('#loading')).toBeVisible()
  await expect(page.locator('#loading-model')).toHaveText(/^Ladataan mallia… \d+ %$/)
  release()
  await expect(page.locator('#result h2').first()).toHaveText('kantarelli', { timeout: 60_000 })
  await expect(page.locator('#loading-model')).toBeHidden()
})

test('a model download that fails is tried again when a photo comes in', async ({ page }) => {
  // The first download of the model breaks off, as on a dropped connection.
  let attempts = 0
  await page.route('**/model.onnx', async (route) => {
    if (attempts++ === 0) await route.abort('connectionreset')
    else await route.continue()
  })
  await page.goto('http://localhost:4173/seeni/')
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Hyväksyn' }).click()
  await expect(page.locator('#status')).toContainText('Mallin lataus epäonnistui')
  await page.locator('#gallery').setInputFiles(chanterelle)
  await expect(page.locator('#result h2').first()).toHaveText('kantarelli', { timeout: 60_000 })
  await expect(page.locator('#status')).toHaveClass(/ready/)
  expect(attempts).toBe(2)
})

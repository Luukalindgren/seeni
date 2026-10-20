// The production build works offline after the first load, and identifying a mushroom
// sends no request at all, so no image leaves the device (hard rule 9).
import { expect, test } from '@playwright/test'
import { fileURLToPath } from 'node:url'

const image = fileURLToPath(new URL('../tests/fixtures/images/3345075329_9ae2b10657.jpg', import.meta.url))

test('identifies a mushroom offline without sending anything', async ({ page, context }) => {
  await page.goto('http://localhost:4173/seeni/')
  await expect(page.locator('#status')).toContainText('Valmis', { timeout: 100_000 })
  // Wait until the service worker controls the page and has precached everything.
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
    if (!navigator.serviceWorker.controller) {
      await new Promise((resolve) => navigator.serviceWorker.addEventListener('controllerchange', resolve))
    }
  })

  await context.setOffline(true)
  await page.reload()
  await expect(page.locator('#status')).toContainText('Valmis', { timeout: 100_000 })

  const requests: string[] = []
  page.on('request', (r) => {
    if (!r.url().startsWith('blob:')) requests.push(`${r.method()} ${r.url()}`)
  })
  context.on('request', (r) => {
    if (!r.url().startsWith('blob:')) requests.push(`${r.method()} ${r.url()}`)
  })
  await page.locator('#photos').setInputFiles(image)
  await expect(page.locator('#result')).not.toContainText('Tunnistetaan', { timeout: 60_000 })
  await expect(page.locator('#result')).toContainText(/Ehdokkaat|En tunnista|ehdottaa|sopivat/)
  expect(requests.filter((r) => !r.startsWith('GET '))).toEqual([])
  expect(requests.filter((r) => !r.includes('/seeni/'))).toEqual([])
})

// The production build works offline after the first load, and identifying a mushroom
// sends no request at all, so no image leaves the device (hard rule 9).
import { expect, test } from '@playwright/test'
import { fileURLToPath } from 'node:url'

const image = fileURLToPath(new URL('../tests/fixtures/images/3345075329_9ae2b10657.jpg', import.meta.url))

test('asks for consent first, then identifies a mushroom offline without sending anything', async ({
  page,
  context,
}) => {
  await page.goto('http://localhost:4173/')
  await expect(page.locator('#warning')).toBeVisible()
  // The consent cannot be skipped: Escape does nothing and the button waits for the checkbox.
  await page.keyboard.press('Escape')
  await expect(page.locator('#warning')).toBeVisible()
  // Even if a browser closes it without the button, it opens again.
  await page.evaluate(() => document.querySelector<HTMLDialogElement>('#warning')!.close())
  await expect(page.locator('#warning')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Hyväksyn' })).toBeDisabled()
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Hyväksyn' }).click()
  await expect(page.locator('#warning')).toBeHidden()
  await expect(page.locator('#status')).toContainText('Valmis', { timeout: 100_000 })
  // Wait until the service worker controls the page and has precached everything.
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
    if (!navigator.serviceWorker.controller) {
      await new Promise((resolve) => navigator.serviceWorker.addEventListener('controllerchange', resolve))
    }
  })
  await expect(page.locator('#status')).toHaveText('Valmis · toimii ilman verkkoa')

  await context.setOffline(true)
  await page.reload()
  // The consent is stored, so it does not come back on reload.
  await expect(page.locator('#warning')).toBeHidden()
  await expect(page.locator('#status')).toContainText('Valmis', { timeout: 100_000 })

  const requests: string[] = []
  context.on('request', (r) => {
    if (!r.url().startsWith('blob:')) requests.push(`${r.method()} ${r.url()}`)
  })
  await page.locator('#gallery').setInputFiles(image)
  await expect(page.locator('#result')).toBeVisible({ timeout: 60_000 })
  await expect(page.locator('#result .reminder').first()).toContainText('Älä syö sientä')
  await expect(page.locator('#result')).toContainText(/Mallin arvio|En tunnista varmasti/)
  expect(requests.filter((r) => !r.startsWith('GET '))).toEqual([])
  expect(requests.filter((r) => new URL(r.split(' ')[1]).origin !== 'http://localhost:4173')).toEqual([])
})

test.describe('without a service worker', () => {
  test.use({ serviceWorkers: 'block' })

  test('the status does not claim that the app works offline', async ({ page }) => {
    await page.goto('http://localhost:4173/')
    await page.getByRole('checkbox').check()
    await page.getByRole('button', { name: 'Hyväksyn' }).click()
    await expect(page.locator('#status')).toHaveText('Valmis', { timeout: 100_000 })
  })
})

// "Ota kuva" on a computer (#55): the webcam in a dialog, a still from it is identified, and
// the camera is off once the dialog closes. Chromium's fake camera stands in for a webcam.
// The clicks also catch the drawn drop area covering the buttons (its class once matched the
// live camera's fixed full-screen `.live` rule).
import { expect, test, type Page } from '@playwright/test'

test.use({
  viewport: { width: 1280, height: 800 },
  permissions: ['camera'],
  launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] },
})

const cameraOn = (page: Page) =>
  page.evaluate(() => {
    const stream = document.querySelector<HTMLVideoElement>('#webcam-dialog video')?.srcObject as MediaStream | null
    return stream?.getVideoTracks().some((t) => t.readyState === 'live') ?? false
  })

test('takes a photo with the webcam and identifies it, then the camera is off', async ({ page }) => {
  await page.goto('http://localhost:4173/')
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Hyväksyn' }).click()
  await page.locator('#webcam').click()
  const dialog = page.locator('#webcam-dialog')
  await expect(dialog).toBeVisible()
  await expect(page.locator('#shutter')).toBeEnabled()
  expect(await cameraOn(page)).toBe(true)
  await page.locator('#shutter').click()
  await expect(dialog).toBeHidden()
  // The fake camera's test pattern is no mushroom: any result will do, the flow is the point.
  await expect(page.locator('#result h2').first()).toBeVisible({ timeout: 60_000 })
  await expect.poll(() => cameraOn(page)).toBe(false)
  await expect(page.locator('#result .shots img, #result img').first()).toBeVisible()
})

test('cancel closes the dialog and switches the camera off', async ({ page }) => {
  await page.goto('http://localhost:4173/')
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Hyväksyn' }).click()
  await page.locator('#webcam').click()
  await expect(page.locator('#shutter')).toBeEnabled()
  await page.locator('#webcam-cancel').click()
  await expect(page.locator('#webcam-dialog')).toBeHidden()
  await expect.poll(() => cameraOn(page)).toBe(false)
  await expect(page.locator('#home')).toBeVisible()
})

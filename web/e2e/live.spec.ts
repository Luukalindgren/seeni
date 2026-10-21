// The phone start screen (#43): the live camera behind a card, a photo from the shutter is
// identified, and the camera is off again afterwards. Chromium's fake camera stands in for a
// phone camera. Without a camera, the plain start screen is shown.
import { devices, expect, test, type Page } from '@playwright/test'

const { defaultBrowserType: _, ...phone } = devices['Pixel 7']
test.use({
  ...phone,
  permissions: ['camera'],
  launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] },
})

async function consent(page: Page) {
  await page.goto('http://localhost:4173/seeni/')
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Hyväksyn' }).click()
}

const cameraOn = (page: Page) =>
  page.evaluate(() => {
    const stream = document.querySelector<HTMLVideoElement>('#live video')?.srcObject as MediaStream | null
    return stream?.getVideoTracks().some((t) => t.readyState === 'live') ?? false
  })

test.describe('with a camera', () => {
  test('opens to the camera, takes a photo and identifies it, then turns the camera off', async ({ page }) => {
    await consent(page)
    const live = page.locator('#live')
    await expect(live).toBeVisible()
    await expect.poll(() => cameraOn(page)).toBe(true)
    // The card first; the shutter only after "Ota kuva".
    await expect(page.locator('#live-shutter')).toBeHidden()
    await page.locator('#live-take').click()
    await expect(page.locator('#live-shutter')).toBeVisible()
    await expect(page.locator('#live .status')).toContainText('Valmis', { timeout: 100_000 })
    await page.locator('#live-shutter').click()
    await expect(page.locator('#result')).toBeVisible({ timeout: 60_000 })
    await expect(live).toBeHidden()
    expect(await cameraOn(page)).toBe(false)

    // A new photo brings the camera back.
    await page.locator('#again').click()
    await expect(live).toBeVisible()
    await expect.poll(() => cameraOn(page)).toBe(true)
  })
})

test.describe('falls back to the plain start screen', () => {
  test('without a camera', async ({ page }) => {
    await page.addInitScript(() => {
      navigator.mediaDevices.enumerateDevices = async () => []
    })
    await consent(page)
    await expect(page.locator('#home .actions')).toBeVisible()
    await expect(page.locator('#live')).toBeHidden()
  })

  test('when camera permission is denied', async ({ page }) => {
    await page.addInitScript(() => {
      navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('denied', 'NotAllowedError'))
    })
    await consent(page)
    await expect(page.locator('#home .actions')).toBeVisible()
    await expect(page.locator('#live')).toBeHidden()
  })
})

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

// Hides or shows the page as far as the app can tell.
const setHidden = (page: Page, hidden: boolean) =>
  page.evaluate((h) => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => h })
    document.dispatchEvent(new Event('visibilitychange'))
  }, hidden)

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
    // The grass and the sky behind the camera rest, and come back with the result.
    await expect(page.locator('#grass')).not.toHaveClass(/visible/)
    // The card first; the shutter only after "Ota kuva".
    await expect(page.locator('#live-shutter')).toBeHidden()
    await page.locator('#live-take').click()
    await expect(page.locator('#live-shutter')).toBeVisible()
    await expect(page.locator('#live .status')).toContainText('Valmis', { timeout: 100_000 })
    await page.locator('#live-shutter').click()
    await expect(page.locator('#result')).toBeVisible({ timeout: 60_000 })
    await expect(live).toBeHidden()
    expect(await cameraOn(page)).toBe(false)
    await expect(page.locator('#grass')).toHaveClass(/visible/)

    // Another photo of the same mushroom goes straight to the shutter.
    await page.getByRole('button', { name: 'Lisää kuva samasta sienestä' }).click()
    await expect(page.locator('#live-shutter')).toBeVisible()
    await expect(page.locator('#live-shutter')).toBeEnabled()
    await page.locator('#live-shutter').click()
    await expect(page.locator('#result .shot')).toHaveCount(2, { timeout: 60_000 })

    // A new photo brings the camera back, with its shutter off until there is a picture.
    await page.locator('#again').click()
    await expect(live).toBeVisible()
    await expect.poll(() => cameraOn(page)).toBe(true)

    // Reading "Tietoa ja lähteet" turns the camera off, and hiding the page does not bring
    // it back over the text.
    await page.locator('#live-info').click()
    await expect(live).toBeHidden()
    await expect(page.locator('#about')).toHaveAttribute('open', '')
    // It tells how to allow the camera for good in Safari (#69).
    await expect(page.locator('#about [data-t="aboutCamera"]')).toContainText('Kamera')
    await setHidden(page, true)
    await setHidden(page, false)
    await expect(live).toBeHidden()
    expect(await cameraOn(page)).toBe(false)
  })

  test('a quick hide and show while the camera starts still ends with the camera on', async ({ page }) => {
    await consent(page)
    await setHidden(page, true)
    await setHidden(page, false)
    await expect(page.locator('#live')).toBeVisible()
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
    // Asking again while still denied explains how to allow the camera (#69).
    await page.locator('#live-retry').click()
    await expect(page.locator('#live-help')).toBeVisible()
    await expect(page.locator('#live')).toBeHidden()
  })

  test('and asks again on request once the camera is allowed', async ({ page }) => {
    await page.addInitScript(() => {
      const real = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices)
      let calls = 0
      navigator.mediaDevices.getUserMedia = (c) =>
        ++calls === 1 ? Promise.reject(new DOMException('denied', 'NotAllowedError')) : real(c)
    })
    await consent(page)
    await expect(page.locator('#live')).toBeHidden()
    await page.locator('#live-retry').click()
    await expect(page.locator('#live')).toBeVisible()
    await expect.poll(() => cameraOn(page)).toBe(true)
    await expect(page.locator('#live-retry')).toBeHidden()
  })
})

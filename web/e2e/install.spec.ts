// Install as an app: Chrome's own prompt where the browser offers one, the Share-menu steps
// on iPhones, and nothing once Seeni runs from the home screen.
import { expect, test } from '@playwright/test'

const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'

async function start(page: import('@playwright/test').Page) {
  await page.goto('http://localhost:4173/')
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Hyväksyn' }).click()
}

test.describe('on an iPhone', () => {
  test.use({ userAgent: iphone })

  test('shows the steps to add Seeni to the home screen', async ({ page }) => {
    await start(page)
    await page.locator('#install-open').click()
    const dialog = page.locator('#install')
    await expect(dialog.getByRole('heading')).toHaveText('Asenna Seeni')
    await expect(dialog.locator('li')).toHaveCount(3)
    await expect(dialog).toContainText('Lisää Koti-valikkoon')
    // With no saved finds, there is nothing to move to the installed app.
    await expect(page.locator('#install-finds')).toBeHidden()
    await page.locator('#install-close').click()
    await expect(dialog).toBeHidden()
  })

  test('offers nothing when opened from the home screen', async ({ page }) => {
    await page.addInitScript(() => Object.defineProperty(navigator, 'standalone', { value: true }))
    await start(page)
    await expect(page.locator('#guide-open')).toBeVisible()
    await expect(page.locator('#install-open')).toBeHidden()
  })
})

test.describe('in an in-app browser on an iPhone', () => {
  test.use({ userAgent: iphone.replace(' Safari/604.1', ' Instagram 300.0') })

  test('offers no steps it cannot follow', async ({ page }) => {
    await start(page)
    await expect(page.locator('#guide-open')).toBeVisible()
    await expect(page.locator('#install-open')).toBeHidden()
  })
})

test('uses the browser’s own install prompt where it has one', async ({ page }) => {
  await start(page)
  await expect(page.locator('#install-open')).toBeHidden()
  await page.evaluate(() => {
    const e = new Event('beforeinstallprompt') as Event & Record<string, unknown>
    e.prompt = async () => void ((window as unknown as Record<string, boolean>).prompted = true)
    e.userChoice = Promise.resolve({ outcome: 'dismissed' })
    window.dispatchEvent(e)
  })
  await page.locator('#install-open').click()
  expect(await page.evaluate(() => (window as unknown as Record<string, boolean>).prompted)).toBe(true)
  await expect(page.locator('#install')).toBeHidden()
  // A prompt can be used only once; the link goes until the browser offers it again.
  await expect(page.locator('#install-open')).toBeHidden()
})

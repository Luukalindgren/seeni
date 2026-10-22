// The grass and the sky in a browser tab on an iPhone (#125): Safari clips fixed elements to
// the area between its status bar and toolbar, so there they belong to the page, the grass
// at its end and the sky at its top. The installed app and other phones keep them fixed.
import { expect, test } from '@playwright/test'

const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
const android = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36'
const phone = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }

async function start(page: import('@playwright/test').Page) {
  await page.goto('http://localhost:4173/')
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Hyväksyn' }).click()
}

const box = (page: import('@playwright/test').Page, id: string) =>
  page.locator(id).evaluate((c) => {
    const r = c.getBoundingClientRect()
    return {
      position: getComputedStyle(c).position,
      top: r.top + scrollY,
      bottom: r.bottom + scrollY,
      left: r.left,
      width: r.width,
      page: document.documentElement.scrollHeight,
      window: innerWidth,
    }
  })

test.describe('in Safari on an iPhone', () => {
  test.use({ ...phone, userAgent: iphone })

  test('the grass stands at the end of the page and the sky at its top', async ({ page }) => {
    await start(page)
    await expect(page.locator('html')).toHaveClass(/ios-browser/)
    await expect(page.locator('meta[name="viewport"]')).toHaveAttribute('content', /viewport-fit=cover/)
    const grass = await box(page, '#grass')
    expect(grass.position).toBe('absolute')
    expect(grass.bottom).toBeCloseTo(grass.page, 0)
    expect(grass.left).toBe(0)
    expect(grass.width).toBe(grass.window)
    const sky = await box(page, '#sky')
    expect(sky.position).toBe('absolute')
    expect(sky.top).toBe(0)
    expect(sky.width).toBe(sky.window)
    // Still drawn, and the buttons in front of it still work.
    await expect(page.locator('#grass')).toBeVisible()
    await page.locator('#info').click()
    await expect(page.locator('#about')).toHaveAttribute('open', '')
  })

  test('a long page keeps the grass at its end, under the last lines', async ({ page }) => {
    await start(page)
    await page.locator('#guide-open').click()
    await page.locator('#guide-close').click()
    await page.locator('#info').click()
    const grass = await box(page, '#grass')
    expect(grass.page).toBeGreaterThan(844)
    expect(grass.bottom).toBeCloseTo(grass.page, 0)
  })

  test('the installed app keeps them fixed to the screen', async ({ page }) => {
    await page.addInitScript(() => Object.defineProperty(navigator, 'standalone', { value: true }))
    await start(page)
    await expect(page.locator('html')).not.toHaveClass(/ios-browser/)
    await expect(page.locator('meta[name="viewport"]')).not.toHaveAttribute('content', /viewport-fit/)
    expect((await box(page, '#grass')).position).toBe('fixed')
    expect((await box(page, '#sky')).position).toBe('fixed')
  })
})

test.describe('in Chrome on an Android phone', () => {
  test.use({ ...phone, userAgent: android })

  test('the grass and the sky stay fixed to the screen', async ({ page }) => {
    await start(page)
    await expect(page.locator('html')).not.toHaveClass(/ios-browser/)
    expect((await box(page, '#grass')).position).toBe('fixed')
    expect((await box(page, '#sky')).position).toBe('fixed')
  })
})

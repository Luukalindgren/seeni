// The grass and the sky in a browser tab on an iPhone (#125): Safari clips fixed elements to
// the area between its status bar and toolbar, so there the sky belongs to the page, at its
// top, and there is no grass. The installed app and other phones keep both, fixed.
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

  test('the sky stands at the top of the page, and there is no grass', async ({ page }) => {
    await start(page)
    await expect(page.locator('html')).toHaveClass(/ios-browser/)
    const sky = await box(page, '#sky')
    expect(sky.position).toBe('absolute')
    expect(sky.top).toBe(0)
    expect(sky.left).toBe(0)
    expect(sky.width).toBe(sky.window)
    await expect(page.locator('#sky')).toBeVisible()
    // Grass at the end of the page floated above an empty strip under Safari's toolbar.
    await expect(page.locator('#grass')).toBeHidden()
    // Home fits the screen: nothing to scroll.
    expect(sky.page).toBeLessThanOrEqual(844)
    // The buttons in front of the sky still work.
    await page.locator('#info').click()
    await expect(page.locator('#about')).toHaveAttribute('open', '')
  })

  test('the installed app keeps them fixed to the screen', async ({ page }) => {
    await page.addInitScript(() => Object.defineProperty(navigator, 'standalone', { value: true }))
    await start(page)
    await expect(page.locator('html')).not.toHaveClass(/ios-browser/)
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

test.describe('home on a phone (#129)', () => {
  test.use({ ...phone, userAgent: android })

  test('has the drawn drop area and big buttons, as on a large screen', async ({ page }) => {
    await start(page)
    const drop = page.locator('#drop')
    await expect(drop).toBeVisible()
    await expect(drop).toHaveClass(/drawn/)
    // The mushroom is drawn on the canvas.
    await expect
      .poll(() =>
        drop.locator('.art').evaluate((c: HTMLCanvasElement) => {
          const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data
          let painted = 0
          for (let i = 3; i < d.length; i += 4) if (d[i]! > 0) painted++
          return painted
        }),
      )
      .toBeGreaterThan(1000)
    // Little text: no intro, only the hint on taking the photo, and nothing to drop.
    await expect(page.locator('#home .intro')).toBeHidden()
    await expect(page.locator('#home > .hint:not(#live-help)')).toBeVisible()
    await expect(drop.locator('.drop-text')).toBeHidden()
    // It fits beside the buttons on the screen.
    const box = (await drop.boundingBox())!
    expect(box.width).toBeLessThan(300)
    await expect(page.locator('.actions label[for="camera"]')).toBeInViewport()
    await expect(page.locator('.actions label[for="gallery"]')).toBeInViewport()
  })
})

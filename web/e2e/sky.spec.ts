// The sky along the top: shown with the grass, drawn behind the content (never catching a
// click), and on phones too, smaller and moving on its own.
import { expect, test } from '@playwright/test'

async function consent(page: import('@playwright/test').Page) {
  await page.goto('http://localhost:4173/')
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Hyväksyn' }).click()
}

test('a large screen has a sky behind the header, and its buttons still work', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await consent(page)
  const sky = page.locator('#sky')
  await expect(sky).toBeVisible()
  await expect(sky).toHaveCSS('pointer-events', 'none')
  // Something is drawn: the clouds and the sun.
  await expect
    .poll(() =>
      sky.evaluate((c: HTMLCanvasElement) => {
        const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data
        let painted = 0
        for (let i = 3; i < d.length; i += 4) if (d[i]! > 0) painted++
        return painted
      }),
    )
    .toBeGreaterThan(1000)
  // The info button in the corner under the sun still opens.
  await page.locator('#info').click()
  await expect(page.locator('#about')).toHaveAttribute('open', '')
})

const snapshot = (canvas: import('@playwright/test').Locator) =>
  canvas.evaluate((c: HTMLCanvasElement) => {
    const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data
    let painted = 0
    let sum = 0
    for (let i = 3; i < d.length; i += 4) {
      if (d[i]! > 0) painted++
      sum = (sum + d[i]! * i) % 1e9
    }
    return { painted, sum }
  })

test('a phone has the sky and the grass too, moving on their own behind the content', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await consent(page)
  for (const id of ['#sky', '#grass']) {
    const canvas = page.locator(id)
    await expect(canvas).toBeVisible()
    await expect(canvas).toHaveCSS('pointer-events', 'none')
    await expect.poll(async () => (await snapshot(canvas)).painted).toBeGreaterThan(500)
    // It sways without anyone touching it.
    const first = await snapshot(canvas)
    await expect.poll(async () => (await snapshot(canvas)).sum).not.toBe(first.sum)
  }
  // Lower than on a large screen.
  expect((await page.locator('#grass').boundingBox())!.height).toBeLessThan(70)
  // The buttons in front of it still work.
  await page.locator('#info').click()
  await expect(page.locator('#about')).toHaveAttribute('open', '')
})

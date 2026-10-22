// The sky along the top on large screens: shown with the grass, drawn behind the content
// (never catching a click), and absent on phones.
import { expect, test } from '@playwright/test'

async function consent(page: import('@playwright/test').Page) {
  await page.goto('http://localhost:4173/seeni/')
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

test('a phone has no sky', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await consent(page)
  await expect(page.locator('#sky')).toBeHidden()
})

// Narrow phones (360 px is common on Android, 320 px the narrowest still in use): no view
// may scroll sideways. The result's header has the most in it.
import { expect, test, type Page } from '@playwright/test'
import { fileURLToPath } from 'node:url'

const chanterelle = fileURLToPath(new URL('../public/species/cantharellus-cibarius.jpg', import.meta.url))

async function sideways(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
}

for (const lang of ['fi', 'en'] as const) {
  test(`nothing scrolls sideways at 320 and 360 px (${lang})`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 })
    await page.goto(`http://localhost:4173/seeni/?lang=${lang}`)
    expect(await sideways(page)).toBe(0)
    await page.getByRole('checkbox').check()
    await page.getByRole('button', { name: lang === 'fi' ? 'Hyväksyn' : 'I accept' }).click()
    expect(await sideways(page)).toBe(0)
    await page.locator('#gallery').setInputFiles(chanterelle)
    await expect(page.locator('#result h2').first()).toBeVisible({ timeout: 60_000 })
    for (const width of [320, 360]) {
      await page.setViewportSize({ width, height: 640 })
      expect(await sideways(page)).toBe(0)
    }
    // The name is hidden only from sight: the heading keeps it.
    await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName('Seeni')
  })
}

test('long species names stay inside their cards at 320 px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 })
  await page.goto('http://localhost:4173/seeni/')
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Hyväksyn' }).click()
  await page.locator('#guide-open').click()
  await expect(page.locator('#guide .lookalike').first()).toBeVisible()
  const outside = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('#guide .lookalikes li')]
      .filter((li) => li.querySelector('strong')!.getBoundingClientRect().right > li.getBoundingClientRect().right)
      .map((li) => li.querySelector('strong')!.textContent),
  )
  expect(outside).toEqual([])
})

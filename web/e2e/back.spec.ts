// The phone's back button moves within the app: from the result to the start screen, from
// adding a photo back to the result, and a sheet first. Before, the result had no history
// entry of its own, so back on a phone left the app.
import { expect, test } from '@playwright/test'
import { fileURLToPath } from 'node:url'

const chanterelle = fileURLToPath(new URL('../public/species/cantharellus-cibarius.jpg', import.meta.url))

test('back goes from a sheet to the result, from adding a photo to the result, and then home', async ({ page }) => {
  await page.goto('http://localhost:4173/seeni/')
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Hyväksyn' }).click()
  const start = await page.evaluate(() => history.length)
  await page.locator('#gallery').setInputFiles(chanterelle)
  await expect(page.locator('#result h2').first()).toHaveText('kantarelli', { timeout: 60_000 })

  // A sheet is closed first, the result stays.
  await page.locator('.lookalike', { hasText: 'lehtomyrkkyseitikki' }).click()
  await expect(page.locator('#sheet')).toBeVisible()
  await page.goBack()
  await expect(page.locator('#sheet')).toBeHidden()
  await expect(page.locator('#result')).toBeVisible()

  // Back while adding a photo returns to the result.
  await page.getByRole('button', { name: 'Lisää kuva samasta sienestä' }).click()
  await expect(page.locator('#adding')).toBeVisible()
  await page.goBack()
  await expect(page.locator('#adding')).toBeHidden()
  await expect(page.locator('#result h2').first()).toHaveText('kantarelli')

  // Back from the result goes to the start screen, within the app.
  await page.goBack()
  await expect(page.locator('#home')).toBeVisible()
  await expect(page.locator('#result')).toBeHidden()
  expect(page.url()).toContain('/seeni/')

  // A new photo, then home with the button: no entry is left behind, so the history does
  // not grow with every mushroom.
  await page.locator('#gallery').setInputFiles(chanterelle)
  await expect(page.locator('#result h2').first()).toHaveText('kantarelli', { timeout: 60_000 })
  await page.locator('#again').click()
  await expect(page.locator('#home')).toBeVisible()
  await expect.poll(() => page.evaluate(() => (history.state as { view?: string } | null)?.view ?? null)).toBeNull()
  await page.locator('#gallery').setInputFiles(chanterelle)
  await expect(page.locator('#result h2').first()).toHaveText('kantarelli', { timeout: 60_000 })
  expect(await page.evaluate(() => history.length)).toBeLessThanOrEqual(start + 2)
  await page.goBack()
  await expect(page.locator('#home')).toBeVisible()
})

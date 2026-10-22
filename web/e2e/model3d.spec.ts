// Species 3D models (#45): a species with a model shows it in place of the photo, credited to
// the photo it was made from; a species without one keeps its photo.
import { expect, test } from '@playwright/test'

async function openSheet(page: import('@playwright/test').Page, search: string) {
  const guide = page.locator('#guide')
  await guide.getByRole('searchbox', { name: 'Hae lajia' }).fill(search)
  await expect(guide.locator('.lookalike')).toHaveCount(1)
  await guide.locator('.lookalike').click()
}

test('the chanterelle sheet shows its 3D model, other sheets their photo', async ({ page }) => {
  await page.goto('http://localhost:4173/seeni/')
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Hyväksyn' }).click()
  await page.locator('#guide-open').click()

  await openSheet(page, 'kantar')
  const figure = page.locator('#sheet .sheet-photo')
  const model = figure.getByRole('img', { name: /Kantarelli, 3D-malli/ })
  await expect(model).toBeVisible({ timeout: 20_000 })
  await expect(figure.locator('img')).toBeHidden()
  await expect(figure.locator('figcaption')).toHaveText('3D-malli valokuvasta: Johan Adler, CC-BY-4.0')
  // It turns with the arrow keys.
  await model.focus()
  await page.keyboard.press('ArrowRight')
  // The photo is one tap away, and the model comes back.
  await figure.getByRole('button', { name: 'Näytä valokuva' }).click()
  await expect(figure.locator('img')).toBeVisible()
  await expect(model).toBeHidden()
  await expect(figure.locator('figcaption')).toHaveText(/^Kuva: /)
  await figure.getByRole('button', { name: 'Näytä 3D-malli' }).click()
  await expect(model).toBeVisible()
  await expect(figure.locator('img')).toBeHidden()

  await page.locator('#sheet-close').click()
  await openSheet(page, 'herkkutat')
  await expect(figure.locator('img')).toBeVisible()
  await expect(figure.locator('canvas')).toHaveCount(0)
  await expect(figure.locator('figcaption')).toHaveText(/^Kuva: /)
})

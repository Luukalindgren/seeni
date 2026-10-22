// Species 3D models (#45): a species with a model shows it in place of the photo, the photo
// is one tap away with the button in the same corner of the picture, and a species without
// a model keeps its photo.
import { expect, test, type Locator, type Page } from '@playwright/test'

async function openSheet(page: Page, search: string) {
  const guide = page.locator('#guide')
  await guide.getByRole('searchbox', { name: 'Hae lajia' }).fill(search)
  await expect(guide.locator('.lookalike')).toHaveCount(1)
  await guide.locator('.lookalike').click()
}

/** The button's offset from the picture's bottom-right corner, in pixels. */
async function corner(picture: Locator, button: Locator) {
  const p = (await picture.boundingBox())!
  const b = (await button.boundingBox())!
  expect(b.x).toBeGreaterThan(p.x + p.width / 2)
  expect(b.y).toBeGreaterThan(p.y + p.height / 2)
  expect(b.x + b.width).toBeLessThanOrEqual(p.x + p.width)
  expect(b.y + b.height).toBeLessThanOrEqual(p.y + p.height)
  return [Math.round(p.x + p.width - b.x - b.width), Math.round(p.y + p.height - b.y - b.height)]
}

test('the chanterelle sheet shows its drawn 3D model, other sheets their photo', async ({ page }) => {
  await page.goto('http://localhost:4173/seeni/')
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Hyväksyn' }).click()
  await page.locator('#guide-open').click()

  await openSheet(page, 'kantar')
  const figure = page.locator('#sheet .sheet-photo')
  const model = figure.getByRole('img', { name: /Kantarelli, 3D-malli/ })
  await expect(model).toBeVisible({ timeout: 20_000 })
  await expect(figure.locator('img')).toBeHidden()
  await expect(figure.locator('figcaption')).toHaveText('Seenin piirtämä 3D-malli')
  // It turns with the arrow keys.
  await model.focus()
  await page.keyboard.press('ArrowRight')

  // The photo is one tap away, and the model comes back; the button stays in the picture's
  // bottom-right corner in both.
  const toPhoto = figure.getByRole('button', { name: 'Näytä valokuva' })
  const onModel = await corner(model, toPhoto)
  await toPhoto.click()
  const img = figure.locator('img')
  await expect(img).toBeVisible()
  await expect(model).toBeHidden()
  await expect(figure.locator('figcaption')).toHaveText(/^Kuva: /)
  const toModel = figure.getByRole('button', { name: 'Näytä 3D-malli' })
  expect(await corner(img, toModel)).toEqual(onModel)
  await toModel.click()
  await expect(model).toBeVisible()
  await expect(img).toBeHidden()

  // Its lookalikes have drawn models too.
  await page.locator('#sheet-close').click()
  await openSheet(page, 'valevahvero')
  await expect(figure.getByRole('img', { name: /Valevahvero, 3D-malli/ })).toBeVisible({ timeout: 20_000 })

  await page.locator('#sheet-close').click()
  await openSheet(page, 'herkkutat')
  await expect(figure.locator('img')).toBeVisible()
  await expect(figure.locator('canvas')).toHaveCount(0)
  await expect(figure.locator('figcaption')).toHaveText(/^Kuva: /)
})

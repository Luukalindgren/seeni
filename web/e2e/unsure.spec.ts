// "Not sure" still names the dangerous species the photo resembles: here a photo the model
// puts mostly in the unknown class (44 %), with the deadly suippumyrkkyseitikki second (36 %).
import { expect, test } from '@playwright/test'
import { fileURLToPath } from 'node:url'

const photo = fileURLToPath(new URL('../tests/fixtures/images/3408602375_c3728d07ba.jpg', import.meta.url))

test('"not sure" names a deadly species the photo resembles, and it opens its sheet', async ({ page }) => {
  await page.goto('http://localhost:4173/seeni/')
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Hyväksyn' }).click()
  await page.locator('#gallery').setInputFiles(photo)
  await expect(page.locator('#result h2')).toHaveText('En tunnista varmasti', { timeout: 60_000 })
  await expect(page.locator('.unsure-danger')).toBeVisible()
  // The most likely dangerous species first.
  const rows = page.locator('.unsure .lookalike')
  await expect(rows.first()).toContainText('Suippumyrkkyseitikki')
  await expect(rows.first()).toContainText('Tappavan myrkyllinen')
  // Only dangerous species are listed: every row has its danger label.
  await expect(page.locator('.unsure .lookalike .badge')).toHaveCount(await rows.count())
  await rows.first().click()
  await expect(page.locator('#sheet-title')).toHaveText('Suippumyrkkyseitikki')
})

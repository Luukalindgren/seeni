// "Not sure" still names the dangerous species the photo resembles: here a brown roll-rim
// (deadly) that the model puts second (28 %) behind an edible bovine bolete (65 %).
import { expect, test } from '@playwright/test'
import { fileURLToPath } from 'node:url'

const rollRim = fileURLToPath(new URL('../tests/fixtures/images/1933241549_d85735d691.jpg', import.meta.url))

test('"not sure" names a deadly species the photo resembles, and it opens its sheet', async ({ page }) => {
  await page.goto('http://localhost:4173/seeni/')
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Hyväksyn' }).click()
  await page.locator('#gallery').setInputFiles(rollRim)
  await expect(page.locator('#result h2')).toHaveText('En tunnista varmasti', { timeout: 60_000 })
  await expect(page.locator('.unsure-danger')).toBeVisible()
  const rows = page.locator('.unsure .lookalike')
  await expect(rows).toHaveCount(1)
  await expect(rows.first()).toContainText('pulkkosieni')
  await expect(rows.first()).toContainText('Tappavan myrkyllinen')
  // Nothing edible is offered as an alternative.
  await expect(page.locator('#result')).not.toContainText('kangastatti')
  await rows.first().click()
  await expect(page.locator('#sheet-title')).toHaveText('pulkkosieni')
})

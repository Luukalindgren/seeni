// "Not sure" still names the dangerous species the photo resembles: here a photo the model
// puts mostly in the unknown class (44 %), with the deadly suippumyrkkyseitikki second (36 %).
import { expect, test } from '@playwright/test'
import { fileURLToPath } from 'node:url'

const photo = fileURLToPath(new URL('../tests/fixtures/images/3408602375_c3728d07ba.jpg', import.meta.url))

test('"not sure" names a deadly species the photo resembles, and it opens its sheet', async ({ page }) => {
  await page.goto('http://localhost:4173/')
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Hyväksyn' }).click()
  await page.locator('#gallery').setInputFiles(photo)
  await expect(page.locator('#result h2')).toHaveText('En tunnista varmasti', { timeout: 60_000 })
  await expect(page.locator('.unsure-danger')).toBeVisible()
  // The most likely dangerous species first.
  const rows = page.locator('.unsure .lookalike')
  await expect(rows.first()).toContainText('Suippumyrkkyseitikki')
  await expect(rows.first()).toContainText('Tappavan myrkyllinen')
  // With its highest estimate in any photo, the one that put it on the list.
  await expect(rows.first().locator('.estimate')).toHaveText(/^\d+ %\s*mallin arvio$/)
  // Only dangerous species are listed: every row has its danger label.
  await expect(page.locator('.unsure .lookalike .badge')).toHaveCount(await rows.count())
  // The share of species Seeni does not know (#136), as the photo leans to the unknown class.
  await expect(page.locator('.unsure-unknown')).toHaveText(/^Jokin laji, jota Seeni ei tunne: \d+ %$/)
  await rows.first().click()
  await expect(page.locator('#sheet-title')).toHaveText('Suippumyrkkyseitikki')
})

// A photo just under the threshold (#136): lehmäntatti about 64 %, punikkitatit about 33 %.
// Both are listed as guesses, with the note that they do not tell what the mushroom is.
const close = fileURLToPath(new URL('../tests/fixtures/images/3898901380_935e1cee5e.jpg', import.meta.url))

test('"not sure" lists the closest guesses at 10 % or more', async ({ page }) => {
  await page.goto('http://localhost:4173/')
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Hyväksyn' }).click()
  await page.locator('#gallery').setInputFiles(close)
  await expect(page.locator('#result h2')).toHaveText('En tunnista varmasti', { timeout: 60_000 })
  const section = page.locator('.unsure-guesses')
  await expect(section.locator('h3')).toHaveText('Lähimmät arvaukset')
  await expect(section).toContainText('eivät kerro, mikä sieni on')
  const rows = section.locator('.lookalike')
  await expect(rows).toHaveCount(2)
  await expect(rows.nth(0)).toContainText('Lehmäntatti')
  await expect(rows.nth(1)).toContainText('Punikkitatit')
  await expect(rows.nth(0).locator('.estimate')).toHaveText(/^\d+ %\s*mallin arvio$/)
  // Still no species result and no recipes.
  await expect(page.locator('.hero')).toHaveCount(0)
  await expect(page.locator('.recipes')).toHaveCount(0)
  await rows.nth(1).click()
  await expect(page.locator('#sheet-title')).toHaveText('Punikkitatit')
})

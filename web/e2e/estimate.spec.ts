// The model's estimate on the cards of the other options: never 0 % or 100 %, always called
// the model's estimate, and for a dangerous species with a small one "not ruled out" instead.
import { expect, test } from '@playwright/test'
import { fileURLToPath } from 'node:url'

const chanterelle = fileURLToPath(new URL('../public/species/cantharellus-cibarius.jpg', import.meta.url))

test('the other options show the model estimate', async ({ page }) => {
  await page.goto('http://localhost:4173/seeni/')
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Hyväksyn' }).click()
  await page.locator('#gallery').setInputFiles(chanterelle)
  await expect(page.locator('#result h2').first()).toHaveText('Kantarelli', { timeout: 60_000 })
  const estimates = page.locator('#result .lookalikes .estimate')
  await expect(estimates.first()).toBeVisible()
  for (const text of await estimates.allInnerTexts()) {
    expect(text.replace(/\s+/g, ' ')).toMatch(/^((< 1|[1-9]\d?) % mallin arvio|ei poissuljettu)$/)
  }
  // The deadly lookalike is never given a small, reassuring number.
  await expect(page.locator('#result .lookalike', { hasText: 'Lehtomyrkkyseitikki' }).locator('.estimate')).toHaveText(
    'ei poissuljettu',
  )
  // After an answer the model's numbers go, as they do for the species itself.
  await page.locator('#result .verify .answers button').first().click()
  await expect(page.locator('#result .meter')).toHaveCount(0)
  await expect(page.locator('#result .lookalikes .estimate')).toHaveCount(0)
})

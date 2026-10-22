// The model's estimate on the cards of the other options, also in "not sure": never 0 % or
// 100 %, and always called the model's estimate.
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
    expect(text.replace(/\s+/g, ' ')).toMatch(/^(< 1|[1-9]\d?) % mallin arvio$/)
  }
})

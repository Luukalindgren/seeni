// Several photos of one mushroom (#46): pick two, remove one, add another from the result.
import { expect, test } from '@playwright/test'
import { readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const dir = fileURLToPath(new URL('../tests/fixtures/images/', import.meta.url))
const images = readdirSync(dir)
  .filter((f) => f.endsWith('.jpg'))
  .slice(0, 3)
  .map((f) => dir + f)

test('identifies several photos together, and photos can be removed and added', async ({ page }) => {
  await page.goto('http://localhost:4173/')
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Hyväksyn' }).click()
  await expect(page.locator('#status')).toContainText('Valmis', { timeout: 100_000 })

  await page.locator('#gallery').setInputFiles(images.slice(0, 2))
  await expect(page.locator('#result')).toBeVisible({ timeout: 60_000 })
  const shots = page.locator('#result .shot')
  await expect(shots).toHaveCount(2)

  await page.getByRole('button', { name: 'Poista kuva 1' }).click()
  await expect(shots).toHaveCount(1)
  // A single photo cannot be removed; it can only be replaced by a new identification.
  await expect(page.locator('#result .shot-remove')).toHaveCount(0)

  await page.getByRole('button', { name: 'Lisää kuva samasta sienestä' }).click()
  await expect(page.locator('#adding')).toBeVisible()
  await expect(page.locator('#adding-count')).toHaveText('2/5')
  await page.locator('#gallery').setInputFiles(images[2]!)
  await expect(page.locator('#result')).toBeVisible({ timeout: 60_000 })
  await expect(shots).toHaveCount(2)
  await expect(page.locator('#adding')).toBeHidden()

  // "Uusi kuva" starts a new mushroom.
  await page.locator('#again').click()
  await page.locator('#gallery').setInputFiles(images[0]!)
  await expect(page.locator('#result')).toBeVisible({ timeout: 60_000 })
  await expect(shots).toHaveCount(1)
})

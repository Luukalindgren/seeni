// A lookalike in the result opens its identification info in a modal (#47).
import { expect, test } from '@playwright/test'
import { fileURLToPath } from 'node:url'

const chanterelle = fileURLToPath(new URL('../public/species/cantharellus-cibarius.jpg', import.meta.url))

test('opens a lookalike, steps into its own lookalike and back, and closes with the back button', async ({ page }) => {
  await page.goto('http://localhost:4173/seeni/')
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Hyväksyn' }).click()
  await page.locator('#gallery').setInputFiles(chanterelle)
  await expect(page.locator('#result h2').first()).toHaveText('Kantarelli', { timeout: 60_000 })

  const sheet = page.locator('#sheet')
  // A deadly lookalike that is not a model class: a warning-only record.
  await page.locator('.lookalike', { hasText: 'lehtomyrkkyseitikki' }).click()
  await expect(sheet).toBeVisible()
  await expect(sheet.locator('h2')).toHaveText('Lehtomyrkkyseitikki')
  await expect(sheet).toContainText('Seeni ei tunnista tätä lajia kuvasta')
  await expect(sheet).toContainText('Näin erotat lajista kantarelli')

  // Its own lookalike opens in the same modal, with a back step.
  await sheet.locator('.sheet-lookalikes button', { hasText: 'suippumyrkkyseitikki' }).click()
  await expect(sheet.locator('h2')).toHaveText('Suippumyrkkyseitikki')
  await page.locator('#sheet-back').click()
  await expect(sheet.locator('h2')).toHaveText('Lehtomyrkkyseitikki')

  // Escape (and Android's back button, which reaches the dialog the same way) goes one back.
  await sheet.locator('.sheet-lookalikes button', { hasText: 'suippumyrkkyseitikki' }).click()
  await expect(sheet.locator('h2')).toHaveText('Suippumyrkkyseitikki')
  await page.keyboard.press('Escape')
  await expect(sheet.locator('h2')).toHaveText('Lehtomyrkkyseitikki')

  await page.goBack()
  await expect(sheet).toBeHidden()

  // Closing from a nested sheet closes all of them, and back then leaves the sheet alone.
  await page.locator('.lookalike', { hasText: 'lehtomyrkkyseitikki' }).click()
  await sheet.locator('.sheet-lookalikes button', { hasText: 'suippumyrkkyseitikki' }).click()
  await page.locator('#sheet-close').click()
  await expect(sheet).toBeHidden()
  await page.locator('.lookalike', { hasText: 'lehtomyrkkyseitikki' }).click()
  await expect(page.locator('#sheet-back')).toBeHidden()
  await page.locator('#sheet-close').click()
  await expect(sheet).toBeHidden()
  await expect(page.locator('#result')).toBeVisible()
})

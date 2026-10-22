// The species guide: every species in a searchable list, each opening its species sheet.
import { expect, test } from '@playwright/test'

test('finds a species by name and opens its sheet', async ({ page }) => {
  await page.goto('http://localhost:4173/seeni/')
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Hyväksyn' }).click()
  await page.locator('#guide-open').click()
  const guide = page.locator('#guide')
  await expect(guide).toBeVisible()
  expect(await guide.locator('.lookalike').count()).toBeGreaterThan(40)
  await guide.getByRole('searchbox', { name: 'Hae lajia' }).fill('kantar')
  await expect(guide.locator('.lookalike')).toHaveCount(1)
  await guide.locator('.lookalike').click()
  await expect(page.locator('#sheet-title')).toHaveText('Kantarelli')
  // A warning-only species is in the guide too, with its danger label.
  await page.locator('#sheet-close').click()
  await expect(page.locator('#sheet')).toBeHidden()
  await guide.getByRole('searchbox').fill('lehtomyrkky')
  await expect(guide.locator('.lookalike .badge')).toHaveText('Tappavan myrkyllinen')
  await page.locator('#guide-close').click()
  await expect(guide).toBeHidden()
})

test('the guide opens without a focus ring and keeps its top edge while searching', async ({ page }) => {
  await page.goto('http://localhost:4173/seeni/')
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Hyväksyn' }).click()
  await page.locator('#guide-open').click()
  const guide = page.locator('#guide')
  // The dialog takes the focus itself, so the close button shows no focus ring (#118).
  await expect(guide).toBeFocused()
  const before = (await guide.boundingBox())!
  await guide.getByRole('searchbox').fill('kantar')
  await expect(guide.locator('.lookalike')).toHaveCount(1)
  // Only the bottom edge moves up (#119).
  const after = (await guide.boundingBox())!
  expect(after.y).toBe(before.y)
  expect(after.height).toBeLessThan(before.height)
  // Tab still reaches the close button, the dialog's first button.
  await guide.focus()
  await page.keyboard.press('Tab')
  await expect(page.locator('#guide-close')).toBeFocused()
})

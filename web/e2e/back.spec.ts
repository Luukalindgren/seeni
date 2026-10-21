// The phone's back button moves within the app: from the result to the start screen, from
// adding a photo back to the result, and a sheet first. Before, the result had no history
// entry of its own, so back on a phone left the app.
import { expect, test } from '@playwright/test'
import { fileURLToPath } from 'node:url'

const chanterelle = fileURLToPath(new URL('../public/species/cantharellus-cibarius.jpg', import.meta.url))

test('back goes from a sheet to the result, from adding a photo to the result, and then home', async ({ page }) => {
  await page.goto('http://localhost:4173/seeni/')
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Hyväksyn' }).click()
  const start = await page.evaluate(() => history.length)
  await page.locator('#gallery').setInputFiles(chanterelle)
  // On the whole result, so a failure shows the error message too.
  await expect(page.locator('#result')).toContainText('kantarelli', { timeout: 60_000 })

  // A sheet is closed first, the result stays.
  await page.locator('.lookalike', { hasText: 'lehtomyrkkyseitikki' }).click()
  await expect(page.locator('#sheet')).toBeVisible()
  await page.goBack()
  await expect(page.locator('#sheet')).toBeHidden()
  await expect(page.locator('#result')).toBeVisible()

  // Back while adding a photo returns to the result.
  await page.getByRole('button', { name: 'Lisää kuva samasta sienestä' }).click()
  await expect(page.locator('#adding')).toBeVisible()
  await page.goBack()
  await expect(page.locator('#adding')).toBeHidden()
  await expect(page.locator('#result h2').first()).toHaveText('kantarelli')

  // Back from the result goes to the start screen, within the app.
  await page.goBack()
  await expect(page.locator('#home')).toBeVisible()
  await expect(page.locator('#result')).toBeHidden()
  expect(page.url()).toContain('/seeni/')

  // A new photo, then home with the button: no entry is left behind, so the history does
  // not grow with every mushroom.
  await page.locator('#gallery').setInputFiles(chanterelle)
  await expect(page.locator('#result h2').first()).toHaveText('kantarelli', { timeout: 60_000 })
  await page.locator('#again').click()
  await expect(page.locator('#home')).toBeVisible()
  await expect.poll(() => page.evaluate(() => (history.state as { view?: string } | null)?.view ?? null)).toBeNull()
  await page.locator('#gallery').setInputFiles(chanterelle)
  await expect(page.locator('#result h2').first()).toHaveText('kantarelli', { timeout: 60_000 })
  // The start entry and one entry for the result.
  expect(await page.evaluate(() => history.length)).toBe(start + 1)

  // Back while an added photo is identified returns to the result as it was.
  await page.getByRole('button', { name: 'Lisää kuva samasta sienestä' }).click()
  await page.locator('#gallery').setInputFiles(chanterelle)
  await expect(page.locator('#loading')).toBeVisible()
  await page.goBack()
  await expect(page.locator('#result h2').first()).toHaveText('kantarelli')
  await expect(page.locator('#result .shot')).toHaveCount(1)
  // The cancelled photo does not turn up later.
  await page.waitForTimeout(2500)
  await expect(page.locator('#result .shot')).toHaveCount(1)

  // Back while a new photo is identified goes home, and the photo is not shown later.
  await page.goBack()
  await expect(page.locator('#home')).toBeVisible()
  await page.locator('#gallery').setInputFiles(chanterelle)
  await expect(page.locator('#loading')).toBeVisible()
  await page.goBack()
  await expect(page.locator('#home')).toBeVisible()
  await page.waitForTimeout(2500)
  await expect(page.locator('#home')).toBeVisible()
})

test('a photo picked right after a button went home still gets its result, and back then goes home', async ({ page }) => {
  await page.goto('http://localhost:4173/seeni/')
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Hyväksyn' }).click()
  await page.locator('#gallery').setInputFiles(chanterelle)
  await expect(page.locator('#result h2').first()).toHaveText('kantarelli', { timeout: 60_000 })
  // The button's back step and the new photo in the same task.
  await page.evaluate(async () => {
    const blob = await (await fetch('/seeni/species/cantharellus-cibarius.jpg')).blob()
    const files = new DataTransfer()
    files.items.add(new File([blob], 'kuva.jpg', { type: 'image/jpeg' }))
    document.querySelector<HTMLButtonElement>('#again')!.click()
    const input = document.querySelector<HTMLInputElement>('#gallery')!
    input.files = files.files
    input.dispatchEvent(new Event('change'))
  })
  await expect(page.locator('#result h2').first()).toHaveText('kantarelli', { timeout: 60_000 })
  await page.goBack()
  await expect(page.locator('#home')).toBeVisible()
})

test('after a reload on the result, back is not lost on leftover entries', async ({ page }) => {
  await page.goto('http://localhost:4173/seeni/')
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Hyväksyn' }).click()
  await page.locator('#gallery').setInputFiles(chanterelle)
  await expect(page.locator('#result h2').first()).toHaveText('kantarelli', { timeout: 60_000 })
  await page.locator('.lookalike', { hasText: 'lehtomyrkkyseitikki' }).click()
  await page.reload()
  await expect(page.locator('#home')).toBeVisible()
  await page.locator('#gallery').setInputFiles(chanterelle)
  await expect(page.locator('#result h2').first()).toHaveText('kantarelli', { timeout: 60_000 })
  await page.goBack()
  await expect(page.locator('#home')).toBeVisible()
})

test('back steps through nested sheets opened from the species guide', async ({ page }) => {
  await page.goto('http://localhost:4173/seeni/')
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Hyväksyn' }).click()
  await page.locator('#guide-open').click()
  await page.locator('#guide').getByRole('searchbox').fill('kantar')
  await page.locator('#guide .lookalike').click()
  const sheet = page.locator('#sheet')
  await expect(sheet.locator('h2')).toHaveText('kantarelli')
  await sheet.locator('.sheet-lookalikes button', { hasText: 'lehtomyrkkyseitikki' }).click()
  await expect(sheet.locator('h2')).toHaveText('lehtomyrkkyseitikki')
  await page.goBack()
  await expect(sheet.locator('h2')).toHaveText('kantarelli')
  await page.goBack()
  await expect(sheet).toBeHidden()
  await expect(page.locator('#home')).toBeVisible()
})

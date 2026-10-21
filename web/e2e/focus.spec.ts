// Keyboard and screen reader focus in the result: a new result starts from its heading, and a
// pressed button that a re-render removes hands focus on (not to the page top).
import { expect, test } from '@playwright/test'
import { fileURLToPath } from 'node:url'

const chanterelle = fileURLToPath(new URL('../public/species/cantharellus-cibarius.jpg', import.meta.url))

test('focus follows the checks when answering from the keyboard', async ({ page }) => {
  await page.goto('http://localhost:4173/seeni/')
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Hyväksyn' }).click()
  await page.locator('#gallery').setInputFiles(chanterelle)
  await expect(page.locator('#result h2').first()).toHaveText('kantarelli', { timeout: 60_000 })
  // A new result starts from its heading.
  await expect(page.locator('#result h2').first()).toBeFocused()

  // "Cannot check this" brings the next question, which gets the focus.
  const first = await page.locator('.verify .question').textContent()
  await page.locator('.verify .answer.ghost').focus()
  await page.keyboard.press('Enter')
  const question = page.locator('.verify .question')
  await expect(question).not.toHaveText(first!)
  await expect(question).toBeFocused()
  // The next Tab reaches its answers.
  await page.keyboard.press('Tab')
  await expect(page.locator('.verify .answer').first()).toBeFocused()

  // Answering until no question is left puts the focus on the result.
  while ((await page.locator('.verify').count()) > 0) {
    await page.locator('.verify .answer').first().focus()
    await page.keyboard.press('Enter')
  }
  await expect(page.locator('#result h2').first()).toBeFocused()

  // Saving the find replaces its button: focus goes to the section's heading.
  await page.getByRole('button', { name: 'Tallenna omiin löytöihin' }).focus()
  await page.keyboard.press('Enter')
  await expect(page.locator('.find-saved')).toBeVisible()
  await expect(page.locator('#result .place h3')).toBeFocused()
})

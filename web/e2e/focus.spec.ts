// Answering the checks from the keyboard: the pressed answer disappears in the re-render, so
// focus moves to the next question, or to the result when none is left (not to the page top).
import { expect, test } from '@playwright/test'
import { fileURLToPath } from 'node:url'

const chanterelle = fileURLToPath(new URL('../public/species/cantharellus-cibarius.jpg', import.meta.url))

test('focus follows the checks when answering from the keyboard', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 700 })
  await page.goto('http://localhost:4173/seeni/')
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Hyväksyn' }).click()
  await page.locator('#gallery').setInputFiles(chanterelle)
  await expect(page.locator('#result h2').first()).toHaveText('kantarelli', { timeout: 60_000 })

  // "Cannot check this" brings the next question, which gets the focus and is scrolled to.
  const first = await page.locator('.verify .question').textContent()
  await page.locator('.verify .answer.ghost').focus()
  await page.keyboard.press('Enter')
  const question = page.locator('.verify .question')
  await expect(question).not.toHaveText(first!)
  await expect(question).toBeFocused()
  await expect(question).toBeInViewport()
  // The next Tab reaches its answers.
  await page.keyboard.press('Tab')
  await expect(page.locator('.verify .answer').first()).toBeFocused()

  // Answering until no question is left puts the focus on the result.
  for (let i = 0; i < 10 && (await page.locator('.verify').count()) > 0; i++) {
    const asked = await question.textContent()
    await page.locator('.verify .answer').first().focus()
    await page.keyboard.press('Enter')
    await expect(page.locator('.verify .question', { hasText: asked! })).toHaveCount(0)
  }
  await expect(page.locator('.verify')).toHaveCount(0)
  await expect(page.locator('#result h2').first()).toBeFocused()
})

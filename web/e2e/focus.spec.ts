// Answering the checks from the keyboard: the pressed answer disappears in the re-render, so
// focus moves to the next question, or to the result when none is left (not to the page top).
import { expect, test } from '@playwright/test'
import { fileURLToPath } from 'node:url'

const chanterelle = fileURLToPath(new URL('../public/species/cantharellus-cibarius.jpg', import.meta.url))

test('focus follows the checks when answering from the keyboard', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 700 })
  await page.goto('http://localhost:4173/')
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Hyväksyn' }).click()
  await page.locator('#gallery').setInputFiles(chanterelle)
  await expect(page.locator('#result h2').first()).toHaveText('Kantarelli', { timeout: 60_000 })

  const question = page.locator('.verify .question')
  const current = async () => (await question.allTextContents())[0] ?? null
  // After a click the next question gets the focus, and the view stays at the top as before.
  const first = await current()
  await page.locator('.verify .answer.ghost').click()
  await expect.poll(current).not.toBe(first)
  await expect(question).toBeFocused()
  expect(await page.evaluate(() => window.scrollY)).toBe(0)
  // Back to the first question to do the same from the keyboard.
  await page.locator('#again').click()
  await expect(page.locator('#result')).toBeHidden()
  await page.locator('#gallery').setInputFiles(chanterelle)
  await expect(page.locator('#result h2').first()).toBeVisible({ timeout: 60_000 })
  await expect.poll(current).toBe(first)

  // From the keyboard, "cannot check this" brings the next question, focused and scrolled to.
  await page.locator('.verify .answer.ghost').focus()
  await page.keyboard.press('Enter')
  await expect.poll(current).not.toBe(first)
  await expect(question).toBeFocused()
  await expect(question).toBeInViewport()
  // The next Tab reaches its answers.
  await page.keyboard.press('Tab')
  await expect(page.locator('.verify .answer').first()).toBeFocused()

  // Answering until no question is left puts the focus on the result.
  for (let i = 0; i < 10 && (await page.locator('.verify').count()) > 0; i++) {
    const asked = await current()
    await page.locator('.verify .answer').first().focus()
    await page.keyboard.press('Enter')
    await expect.poll(current).not.toBe(asked)
  }
  await expect(page.locator('.verify')).toHaveCount(0)
  await expect(page.locator('#result h2').first()).toBeFocused()
})

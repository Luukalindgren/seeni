// The English version (#52): a browser that prefers English starts in English, the header
// button switches at once without losing the result or the answers, and the choice stays.
import { expect, test, type Page } from '@playwright/test'
import { fileURLToPath } from 'node:url'

const chanterelle = fileURLToPath(new URL('../public/species/cantharellus-cibarius.jpg', import.meta.url))

async function identify(page: Page, accept: string) {
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: accept }).click()
  await page.locator('#gallery').setInputFiles(chanterelle)
}

test.describe('in an English browser', () => {
  test.use({ locale: 'en-GB' })

  test('starts in English, and switches to Finnish keeping the result and the answers', async ({ page }) => {
    await page.goto('http://localhost:4173/')
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
    await expect(page.locator('#warning h2')).toHaveText('Before you start')
    await identify(page, 'I accept')
    await expect(page.locator('#result h2').first()).toHaveText('Chanterelle', { timeout: 60_000 })
    await expect(page.locator('.verify h3')).toHaveText('How to make sure')
    const question = await page.locator('.verify .question').textContent()
    // Answer the first check in English.
    await page.locator('.verify .answer').first().click()
    const checked = page.locator('#result .checked li')
    await expect(checked).toHaveCount(1)
    await expect(checked.first()).toContainText(question!)

    await page.locator('#lang').click()
    await expect(page.locator('html')).toHaveAttribute('lang', 'fi')
    await expect(page.locator('#result h2').first()).toHaveText('Kantarelli')
    // The same answer, now in Finnish.
    await expect(page.locator('#result .checked li')).toHaveCount(1)
    await expect(page.locator('#result h3', { hasText: 'Tarkistamasi asiat' })).toBeVisible()

    // The choice is remembered.
    await page.reload()
    await expect(page.locator('html')).toHaveAttribute('lang', 'fi')
  })
})

test('opens in English from ?lang=en, also the lookalike sheet', async ({ page }) => {
  await page.goto('http://localhost:4173/?lang=en')
  await expect(page.locator('#info')).toHaveAttribute('aria-label', 'About and sources')
  await identify(page, 'I accept')
  await expect(page.locator('#result h2').first()).toHaveText('Chanterelle', { timeout: 60_000 })
  await page.locator('.lookalike', { hasText: "fool's webcap" }).click()
  const sheet = page.locator('#sheet')
  await expect(sheet.locator('h2')).toHaveText("Fool's webcap")
  await expect(sheet).toContainText('Deadly poisonous')
  await expect(sheet).toContainText('How to tell it from chanterelle')
  await expect(sheet).not.toContainText('kyllä')
})

test('the warning has its own language switch, and a switch drops ?lang= from the address', async ({ page }) => {
  await page.goto('http://localhost:4173/?lang=fi')
  await expect(page.locator('#warning h2')).toHaveText('Ennen kuin aloitat')
  await page.locator('#warning-lang').click()
  await expect(page.locator('#warning h2')).toHaveText('Before you start')
  expect(new URL(page.url()).searchParams.has('lang')).toBe(false)
  await page.reload()
  await expect(page.locator('#warning h2')).toHaveText('Before you start')
})

test('a "not sure" reached by the answers stays "not sure" after a switch', async ({ page }) => {
  await page.goto('http://localhost:4173/')
  await identify(page, 'Hyväksyn')
  await expect(page.locator('#result h2').first()).toHaveText('Kantarelli', { timeout: 60_000 })
  // A dark spore print fits none of the candidates.
  await page.locator('.verify .answer', { hasText: 'violetinmusta' }).click()
  await expect(page.locator('#result h2')).toHaveText('En tunnista varmasti')
  await page.locator('#lang').click()
  await expect(page.locator('#result h2')).toHaveText("I cannot identify this reliably")
  await expect(page.locator('#result .verify')).toHaveCount(0)
})

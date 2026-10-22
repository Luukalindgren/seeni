// Accessibility: axe-core finds no WCAG 2.0-2.2 A/AA violations on the main views and
// dialogs. Animations are off so that contrast is measured on the final colours. Not covered:
// the live camera and the webcam dialog, which need a camera.
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

test.use({ reducedMotion: 'reduce' })

const chanterelle = readFileSync(fileURLToPath(new URL('../public/species/cantharellus-cibarius.jpg', import.meta.url)))

async function check(page: Page, name: string) {
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()
  const report = violations.map((v) => `${v.id}: ${v.help}\n  ${v.nodes.map((n) => n.target.join(' ')).join('\n  ')}`)
  expect.soft(report, name).toEqual([])
}

test('the warning, home, result, sheet, guide and finds have no violations', async ({ page }) => {
  await page.goto('http://localhost:4173/seeni/')
  await expect(page.locator('#warning')).toBeVisible()
  await check(page, 'warning')
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Hyväksyn' }).click()
  await expect(page.locator('.status')).toContainText('Valmis', { timeout: 60_000 })
  await check(page, 'home')
  await expect(page.locator('#lang')).toHaveAccessibleName('EN In English')
  await expect(page.locator('#lang [data-t="languageShort"]')).toHaveAttribute('lang', 'en')

  await page.locator('#gallery').setInputFiles({ name: 'sieni.jpg', mimeType: 'image/jpeg', buffer: chanterelle })
  await expect(page.locator('#result h2').first()).toHaveText('Kantarelli', { timeout: 60_000 })
  await check(page, 'result')

  await page.locator('#result .lookalike').first().click()
  await expect(page.locator('#sheet')).toBeVisible()
  await check(page, 'sheet')
  await page.locator('#sheet-close').click()

  await page.getByRole('button', { name: 'Tallenna omiin löytöihin' }).click()
  await page.getByRole('button', { name: 'Omat löydöt', exact: true }).click()
  await expect(page.locator('#finds .find')).toHaveCount(1)
  await check(page, 'finds')
  await page.locator('#finds-close').click()

  await page.getByRole('button', { name: 'Uusi kuva' }).click()
  await page.locator('#guide-open').click()
  await expect(page.locator('#guide .lookalike').first()).toBeVisible()
  await check(page, 'guide')
  await page.locator('#guide-close').click()

  await page.locator('#info').click()
  await expect(page.locator('#about')).toBeVisible()
  await check(page, 'about')
})

test.describe('on an iPhone', () => {
  test.use({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' })

  test('the install dialog has no violations', async ({ page }) => {
    await page.goto('http://localhost:4173/seeni/')
    await page.getByRole('checkbox').check()
    await page.getByRole('button', { name: 'Hyväksyn' }).click()
    await page.locator('#install-open').click()
    await expect(page.locator('#install')).toBeVisible()
    await check(page, 'install')
  })
})

test.describe('in English', () => {
  test.use({ locale: 'en-GB' })

  test('the result and the "not sure" view have no violations', async ({ page }) => {
    await page.goto('http://localhost:4173/seeni/')
    await page.getByRole('checkbox').check()
    await page.getByRole('button', { name: 'I accept' }).click()
    await page.locator('#gallery').setInputFiles({ name: 'sieni.jpg', mimeType: 'image/jpeg', buffer: chanterelle })
    await expect(page.locator('#result h2').first()).toHaveText('Chanterelle', { timeout: 60_000 })
    await check(page, 'result')
    // A dark spore print fits none of the candidates.
    await page.locator('.verify .answer', { hasText: 'dark chocolate brown or violet black' }).click()
    await expect(page.locator('#result h2').first()).toHaveText('I cannot identify this reliably')
    await check(page, 'not sure')
  })
})

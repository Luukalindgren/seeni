// Recipes (#50): shown only once the checks are done and nothing dangerous is left, always
// with the note to have the mushroom confirmed, and as plain links to the recipe site.
import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const chanterelle = fileURLToPath(new URL('../public/species/cantharellus-cibarius.jpg', import.meta.url))
const records: { tarkistukset: { kysymys: string; vastaukset: Record<string, string[]> }[] }[] = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../species/species.json', import.meta.url)), 'utf8'),
)
const checks = new Map(records.flatMap((r) => r.tarkistukset.map((c) => [c.kysymys, c] as const)))

test('a chanterelle checked to the end shows recipes with the note', async ({ page }) => {
  await page.goto('http://localhost:4173/seeni/')
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Hyväksyn' }).click()
  await page.locator('#gallery').setInputFiles(chanterelle)
  await expect(page.locator('#result h2').first()).toHaveText('Kantarelli', { timeout: 60_000 })
  // Nothing before the checks.
  await expect(page.locator('.recipes')).toHaveCount(0)
  // Answer each check as a chanterelle would, until no check is left.
  for (let i = 0; i < 10 && (await page.locator('.verify .question').count()) > 0; i++) {
    const question = (await page.locator('.verify .question').textContent())!
    const check = checks.get(question)!
    const fits = Object.keys(check.vastaukset).find((a) => check.vastaukset[a]!.includes('cantharellus-cibarius'))!
    await page.locator('.verify').getByRole('button', { name: fits, exact: true }).click()
    await expect(page.locator('#result .checked li')).toHaveCount(i + 1)
  }
  const recipes = page.locator('.recipes')
  await expect(recipes).toBeVisible()
  await expect(recipes).toContainText('Valmista vain sieni, jonka sienineuvoja on varmistanut.')
  const link = recipes.getByRole('link').first()
  await expect(link).toHaveAttribute('href', /^https:\/\/(www\.valio\.fi|yhteishyva\.fi)\//)
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  // The species' own sheet from the result shows none, even with the gate open.
  await page.locator('.gallery-open').click()
  await expect(page.locator('#sheet-title')).toHaveText('Kantarelli')
  await expect(page.locator('#sheet .recipes')).toHaveCount(0)
})

test('no recipes when every check is skipped', async ({ page }) => {
  await page.goto('http://localhost:4173/seeni/')
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Hyväksyn' }).click()
  await page.locator('#gallery').setInputFiles(chanterelle)
  await expect(page.locator('#result h2').first()).toHaveText('Kantarelli', { timeout: 60_000 })
  // Skipping every check answers nothing, so nothing is ruled out.
  for (let i = 0; i < 10 && (await page.locator('.verify .question').count()) > 0; i++) {
    await page.getByRole('button', { name: 'En pysty tarkistamaan tätä' }).click()
  }
  await expect(page.locator('.verify')).toHaveCount(0)
  await expect(page.locator('.recipes')).toHaveCount(0)
})

test('the species guide shows recipes with its own note, a result sheet never', async ({ page }) => {
  await page.goto('http://localhost:4173/seeni/')
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Hyväksyn' }).click()
  await page.locator('#guide-open').click()
  const guide = page.locator('#guide')
  await guide.getByRole('searchbox', { name: 'Hae lajia' }).fill('kantar')
  await guide.locator('.lookalike').click()
  await expect(page.locator('#sheet-title')).toHaveText('Kantarelli')
  const recipes = page.locator('#sheet .recipes')
  await expect(recipes).toBeVisible()
  await expect(recipes).toContainText('Lajiopas ei tunnista sientäsi.')
  await expect(recipes).toContainText('tarkista ensin sen näköislajit')
  // The dangerous lookalikes are named again next to the links.
  await expect(recipes).toContainText('Vaaralliset näköislajit:')
  await expect(recipes.getByRole('link').first()).toHaveAttribute('rel', 'noopener noreferrer')
  // Not on a species without recipes.
  await page.locator('#sheet-close').click()
  await guide.getByRole('searchbox').fill('lehtomyrkky')
  await guide.locator('.lookalike').click()
  await expect(page.locator('#sheet-title')).toHaveText('Lehtomyrkkyseitikki')
  await expect(page.locator('#sheet .recipes')).toHaveCount(0)
  await page.locator('#sheet-close').click()
  // Nor on an edible lookalike's sheet opened from a deadly species' sheet.
  await guide.getByRole('searchbox').fill('suippumyrkky')
  await guide.locator('.lookalike').click()
  await page.locator('#sheet .sheet-lookalikes .lookalike', { hasText: 'Suppilovahvero' }).click()
  await expect(page.locator('#sheet-title')).toHaveText('Suppilovahverot')
  await expect(page.locator('#sheet .recipes')).toHaveCount(0)
  await page.locator('#sheet-close').click()
  await page.locator('#guide-close').click()

  // The sheet of a result's species, opened before any check: no recipes there.
  await page.locator('#gallery').setInputFiles(chanterelle)
  await expect(page.locator('#result h2').first()).toHaveText('Kantarelli', { timeout: 60_000 })
  await page.locator('.gallery-open').click()
  await expect(page.locator('#sheet-title')).toHaveText('Kantarelli')
  await expect(page.locator('#sheet .recipes')).toHaveCount(0)
})

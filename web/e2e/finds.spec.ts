// My finds: a saved mushroom stays on the device with its suggested species and can be
// deleted.
import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const chanterelle = readFileSync(fileURLToPath(new URL('../public/species/cantharellus-cibarius.jpg', import.meta.url)))

test('saves a find, lists it after a reload, and deletes it', async ({ page }) => {
  await page.goto('http://localhost:4173/seeni/')
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Hyväksyn' }).click()
  await expect(page.locator('#finds-open')).toBeHidden()
  await page.locator('#gallery').setInputFiles({ name: 'sieni.jpg', mimeType: 'image/jpeg', buffer: chanterelle })
  await expect(page.locator('#result h2').first()).toHaveText('kantarelli', { timeout: 60_000 })
  await page.getByRole('button', { name: 'Tallenna omiin löytöihin' }).click()
  await expect(page.locator('.find-saved')).toContainText('Tallennettu omiin löytöihin')

  await page.reload()
  await page.locator('#finds-open').click()
  const list = page.locator('#finds-list')
  await expect(list.locator('.find')).toHaveCount(1)
  await expect(list.locator('.find strong')).toHaveText('kantarelli?')
  await list.getByRole('button', { name: 'Poista: kantarelli?' }).click()
  await expect(list).toContainText('Ei tallennettuja löytöjä')
  await page.getByRole('button', { name: 'Sulje' }).click()
  await expect(page.locator('#finds-open')).toBeHidden()
})

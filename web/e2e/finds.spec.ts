// My finds: a saved mushroom stays on the device with its suggested species and can be
// deleted.
import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const chanterelle = readFileSync(fileURLToPath(new URL('../public/species/cantharellus-cibarius.jpg', import.meta.url)))

test('saves a find, lists it after a reload, and deletes it', async ({ page }) => {
  await page.goto('http://localhost:4173/')
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Hyväksyn' }).click()
  await expect(page.locator('#finds-open')).toBeHidden()
  await page.locator('#gallery').setInputFiles({ name: 'sieni.jpg', mimeType: 'image/jpeg', buffer: chanterelle })
  await expect(page.locator('#result h2').first()).toHaveText('Kantarelli', { timeout: 60_000 })
  await page.getByRole('button', { name: 'Tallenna omiin löytöihin' }).click()
  await expect(page.locator('.find-saved')).toContainText('Tallennettu omiin löytöihin')

  await page.reload()
  await page.locator('#finds-open').click()
  const list = page.locator('#finds-list')
  await expect(list.locator('.find')).toHaveCount(1)
  await expect(list.locator('.find strong')).toHaveText('Kantarelli?')
  // Its dangerous lookalikes are named in the list too (hard rule 8).
  await expect(list.locator('.find-danger')).toContainText('lehtomyrkkyseitikki')
  await list.getByRole('button', { name: 'Poista: Kantarelli?' }).click()
  await expect(list).toContainText('Ei tallennettuja löytöjä')
  await page.getByRole('button', { name: 'Sulje' }).click()
  await expect(page.locator('#finds-open')).toBeHidden()
})

test('saves the finds to a backup file and restores them from it', async ({ page }) => {
  await page.goto('http://localhost:4173/')
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Hyväksyn' }).click()
  await page.locator('#gallery').setInputFiles({ name: 'sieni.jpg', mimeType: 'image/jpeg', buffer: chanterelle })
  await expect(page.locator('#result h2').first()).toHaveText('Kantarelli', { timeout: 60_000 })
  await page.getByRole('button', { name: 'Tallenna omiin löytöihin' }).click()
  await expect(page.locator('.find-saved')).toBeVisible()

  await page.getByRole('button', { name: 'Omat löydöt', exact: true }).click()
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Tallenna varmuuskopio' }).click()
  const file = await download
  expect(file.suggestedFilename()).toMatch(/^seeni-loydot-\d{4}-\d\d-\d\d\.json$/)
  const backup = readFileSync(await file.path())

  // Restoring onto the same device adds nothing; after deleting, it brings the find back.
  const chooser = () => page.locator('#finds-import-file')
  await chooser().setInputFiles({ name: 'b.json', mimeType: 'application/json', buffer: backup })
  await expect(page.locator('#finds-backup-status')).toHaveText('Varmuuskopiossa ei ollut uusia löytöjä.')
  const list = page.locator('#finds-list')
  await list.getByRole('button', { name: 'Poista: Kantarelli?' }).click()
  await expect(list).toContainText('Ei tallennettuja löytöjä')
  await expect(page.getByRole('button', { name: 'Tallenna varmuuskopio' })).toBeHidden()
  await chooser().setInputFiles({ name: 'b.json', mimeType: 'application/json', buffer: backup })
  await expect(page.locator('#finds-backup-status')).toHaveText('1 löytö palautettiin.')
  await expect(list.locator('.find strong')).toHaveText('Kantarelli?')
  await expect(list.locator('.find img')).toHaveJSProperty('complete', true)
  expect(await list.locator('.find img').evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(160)

  await chooser().setInputFiles({ name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{"a":1}') })
  await expect(page.locator('#finds-backup-status')).toHaveText('Tiedostoa ei voitu lukea. Valitse Seenin tallentama varmuuskopio.')
})

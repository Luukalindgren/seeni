// The season note (#48): a species rarely found at that time of year gets a note, which the
// setting under About turns off.
import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const chanterelle = readFileSync(fileURLToPath(new URL('../public/species/cantharellus-cibarius.jpg', import.meta.url)))

async function identify(page: Page, today: string) {
  await page.clock.setFixedTime(new Date(today))
  await page.goto('http://localhost:4173/')
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Hyväksyn' }).click()
  await page.locator('#gallery').setInputFiles({ name: 'sieni.jpg', mimeType: 'image/jpeg', buffer: chanterelle })
  await expect(page.locator('#result h2').first()).toHaveText('Kantarelli', { timeout: 60_000 })
}

test('notes a chanterelle in March, and the setting turns the note off', async ({ page }) => {
  await identify(page, '2027-03-10T12:00:00')
  const note = page.locator('.season-note')
  await expect(note).toContainText('Harvinainen löytö maaliskuussa')
  await page.locator('#about summary').click()
  await page.getByRole('checkbox', { name: 'Vertaa ajankohtaan ja alueeseen' }).uncheck()
  await expect(note).toHaveCount(0)
})

test('says nothing about a chanterelle in August', async ({ page }) => {
  await identify(page, '2027-08-10T12:00:00')
  await expect(page.locator('#result h2').first()).toBeVisible()
  await expect(page.locator('.season-note')).toHaveCount(0)
})

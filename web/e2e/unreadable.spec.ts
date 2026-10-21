// A file that is not an image gets a plain explanation, and among several photos it is left
// out instead of failing them all.
import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const chanterelle = {
  name: 'kantarelli.jpg',
  mimeType: 'image/jpeg',
  buffer: readFileSync(fileURLToPath(new URL('../public/species/cantharellus-cibarius.jpg', import.meta.url))),
}
const broken = { name: 'rikki.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('not an image') }

test('explains a file that cannot be opened, and leaves it out among several photos', async ({ page }) => {
  await page.goto('http://localhost:4173/seeni/')
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Hyväksyn' }).click()

  await page.locator('#gallery').setInputFiles(broken)
  await expect(page.locator('#result h2')).toHaveText('Kuvaa ei voitu avata', { timeout: 60_000 })
  await expect(page.locator('#result')).toContainText('JPEG')
  await expect(page.locator('#result')).not.toContainText('InvalidStateError')

  await page.locator('#again').click()
  await page.locator('#gallery').setInputFiles([broken, chanterelle])
  await expect(page.locator('#result h2').first()).toHaveText('kantarelli', { timeout: 60_000 })
  await expect(page.locator('#result .photo-notice')).toHaveText('Yhtä kuvaa ei voitu avata, joten se jätettiin pois.')
  await expect(page.locator('#result .shot')).toHaveCount(1)
})

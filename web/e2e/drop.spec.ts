// Drag and drop on a computer: a photo dropped on the page is identified, and a file that is
// not an image gets the same explanation as one that cannot be opened.
import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

test.use({ viewport: { width: 1280, height: 800 } })

const chanterelle = readFileSync(fileURLToPath(new URL('../public/species/cantharellus-cibarius.jpg', import.meta.url)))

async function dropFile(page: Page, name: string, type: string, bytes: Buffer) {
  await page.evaluate(
    ({ name, type, data }) => {
      const transfer = new DataTransfer()
      transfer.items.add(new File([Uint8Array.from(atob(data), (c) => c.charCodeAt(0))], name, { type }))
      const target = document.querySelector('#drop')!
      for (const kind of ['dragenter', 'dragover', 'drop']) {
        target.dispatchEvent(new DragEvent(kind, { dataTransfer: transfer, bubbles: true, cancelable: true }))
      }
    },
    { name, type, data: bytes.toString('base64') },
  )
}

test('a dropped photo is identified, and a dropped document is explained', async ({ page }) => {
  await page.goto('http://localhost:4173/')
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Hyväksyn' }).click()

  await dropFile(page, 'sieni.jpg', 'image/jpeg', chanterelle)
  await expect(page.locator('#result h2').first()).toHaveText('Kantarelli', { timeout: 60_000 })
  await expect(page.locator('#drop')).not.toHaveClass(/dragging/)

  await page.locator('#again').click()
  await dropFile(page, 'ohje.pdf', 'application/pdf', Buffer.from('%PDF-1.4'))
  await expect(page.locator('#result h2')).toHaveText('Kuvaa ei voitu avata', { timeout: 60_000 })
})

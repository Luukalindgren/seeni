// Species 3D models (#45): a species with a model shows it in place of the photo, credited to
// the photo it was made from; a species without one keeps its photo.
import { expect, test } from '@playwright/test'

async function openSheet(page: import('@playwright/test').Page, search: string) {
  const guide = page.locator('#guide')
  await guide.getByRole('searchbox', { name: 'Hae lajia' }).fill(search)
  await expect(guide.locator('.lookalike')).toHaveCount(1)
  await guide.locator('.lookalike').click()
}

test('the chanterelle sheet shows its 3D model, other sheets their photo', async ({ page }) => {
  await page.goto('http://localhost:4173/seeni/')
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Hyväksyn' }).click()
  await page.locator('#guide-open').click()

  await openSheet(page, 'kantar')
  const figure = page.locator('#sheet .sheet-photo')
  const model = figure.getByRole('img', { name: /Kantarelli, 3D-malli/ })
  await expect(model).toBeVisible({ timeout: 20_000 })
  await expect(figure.locator('img')).toBeHidden()
  await expect(figure.locator('figcaption')).toHaveText('3D-malli valokuvasta: Reidun Braathen, CC-BY-4.0')
  // It turns with the arrow keys.
  await model.focus()
  await page.keyboard.press('ArrowRight')
  // The photo is one tap away, and the model comes back.
  await figure.getByRole('button', { name: 'Näytä valokuva' }).click()
  await expect(figure.locator('img')).toBeVisible()
  await expect(model).toBeHidden()
  await expect(figure.locator('figcaption')).toHaveText(/^Kuva: /)
  await figure.getByRole('button', { name: 'Näytä 3D-malli' }).click()
  await expect(model).toBeVisible()
  await expect(figure.locator('img')).toBeHidden()

  await page.locator('#sheet-close').click()
  await openSheet(page, 'herkkutat')
  await expect(figure.locator('img')).toBeVisible()
  await expect(figure.locator('canvas')).toHaveCount(0)
  await expect(figure.locator('figcaption')).toHaveText(/^Kuva: /)
})

test('models are freed when their sheet is replaced, and cached for offline', async ({ page }) => {
  // Keep every WebGL context the page makes, to count the ones still alive.
  await page.addInitScript(() => {
    const made: WebGLRenderingContext[] = ((window as unknown as { contexts: WebGLRenderingContext[] }).contexts = [])
    const getContext = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, ...args: unknown[]) {
      const c = (getContext as (...a: unknown[]) => unknown).apply(this, args)
      if (args[0] === 'webgl' && c) made.push(c as WebGLRenderingContext)
      return c
    } as typeof getContext
  })
  await page.goto('http://localhost:4173/seeni/')
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Hyväksyn' }).click()
  await expect(page.locator('#status')).toContainText('Valmis', { timeout: 100_000 })
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
    if (!navigator.serviceWorker.controller) {
      await new Promise((resolve) => navigator.serviceWorker.addEventListener('controllerchange', resolve))
    }
  })
  await page.locator('#guide-open').click()
  for (let i = 0; i < 5; i++) {
    await openSheet(page, 'kantar')
    await expect(page.locator('#sheet canvas.model3d')).toBeVisible({ timeout: 20_000 })
    // Hidden before it is replaced, so no intersection change tells the model it is gone.
    await page.locator('#sheet').getByRole('button', { name: 'Näytä valokuva' }).click()
    await page.locator('#sheet-close').click()
  }
  // Browsers keep only about 16 WebGL contexts: the replaced sheets' ones are freed.
  const alive = await page.evaluate(() =>
    (window as unknown as { contexts: WebGLRenderingContext[] }).contexts.filter((c) => !c.isContextLost()).length,
  )
  expect(alive).toBeLessThanOrEqual(1)
  const cached = await page.evaluate(async () => (await (await caches.open('species-3d')).keys()).map((r) => r.url))
  expect(cached).toEqual(['http://localhost:4173/seeni/species/3d/cantharellus-cibarius.glb'])
})

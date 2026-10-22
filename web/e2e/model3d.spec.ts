// Species 3D models (#45): a species with a model shows it in place of the photo, captioned
// as Seeni's own drawing; a species without one keeps its photo.
import { expect, test } from '@playwright/test'
import { fileURLToPath } from 'node:url'

type Box = { x: number; y: number; width: number; height: number }

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
  await expect(figure.locator('figcaption')).toHaveText('Seenin piirtämä 3D-malli')
  // It turns with the arrow keys.
  await model.focus()
  await page.keyboard.press('ArrowRight')
  // The photo is one tap away, and the model comes back; the button stays put, in the
  // picture's bottom right corner.
  const toggle = figure.locator('.model3d-toggle')
  const at3d = (await toggle.boundingBox())!
  const picture = (await model.boundingBox())!
  expect(at3d.x + at3d.width).toBeGreaterThan(picture.x + picture.width - 40)
  expect(at3d.y + at3d.height).toBeGreaterThan(picture.y + picture.height - 40)
  expect(at3d.y + at3d.height).toBeLessThanOrEqual(picture.y + picture.height)
  await figure.getByRole('button', { name: 'Näytä valokuva' }).click()
  const atPhoto = (await toggle.boundingBox())!
  expect(atPhoto.x + atPhoto.width).toBeCloseTo(at3d.x + at3d.width, 0)
  expect(atPhoto.y + atPhoto.height).toBeCloseTo(at3d.y + at3d.height, 0)
  await expect(figure.locator('img')).toBeVisible()
  await expect(model).toBeHidden()
  await expect(figure.locator('figcaption')).toHaveText(/^Kuva: /)
  await figure.getByRole('button', { name: 'Näytä 3D-malli' }).click()
  await expect(model).toBeVisible()
  await expect(figure.locator('img')).toBeHidden()

  // Its lookalikes have drawn models too.
  await page.locator('#sheet-close').click()
  await openSheet(page, 'valevahvero')
  await expect(figure.getByRole('img', { name: /Valevahvero, 3D-malli/ })).toBeVisible({ timeout: 20_000 })
  await page.locator('#sheet-close').click()
  await openSheet(page, 'lehtomyrkky')
  await expect(figure.getByRole('img', { name: /Lehtomyrkkyseitikki, 3D-malli/ })).toBeVisible({ timeout: 20_000 })

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

test('in the result, the button and the credit sit on the picture without overlapping', async ({ page }) => {
  await page.goto('http://localhost:4173/seeni/')
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Hyväksyn' }).click()
  await page.locator('#gallery').setInputFiles(fileURLToPath(new URL('../public/species/cantharellus-cibarius.jpg', import.meta.url)))
  const hero = page.locator('#result .hero-photo')
  await expect(hero.locator('canvas.model3d')).toBeVisible({ timeout: 60_000 })
  const overlap = (a: Box, b: Box) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
  for (const view of ['model', 'photo']) {
    const picture = (await hero.locator(view === 'model' ? 'canvas.model3d' : '.model3d-stage > img').boundingBox())!
    const button = (await hero.locator('.model3d-toggle').boundingBox())!
    const credit = (await hero.locator('figcaption').boundingBox())!
    expect(button.x + button.width).toBeGreaterThan(picture.x + picture.width - 40)
    expect(button.y + button.height).toBeGreaterThan(picture.y + picture.height - 40)
    expect(overlap(button, credit), view).toBe(false)
    expect(credit.y + credit.height).toBeLessThanOrEqual(picture.y + picture.height)
    if (view === 'model') await hero.getByRole('button', { name: 'Näytä valokuva' }).click()
  }
})

// The first load shows how much of the model and the runtime has been downloaded.
import { expect, test } from '@playwright/test'

test('shows the download progress of the model, then ready', async ({ page }) => {
  // Every text the status line shows, from the start.
  await page.addInitScript(() => {
    const seen: string[] = []
    ;(window as unknown as { statusTexts: string[] }).statusTexts = seen
    new MutationObserver(() => {
      const text = document.querySelector('#status')?.textContent
      if (text && seen[seen.length - 1] !== text) seen.push(text)
    }).observe(document, { subtree: true, childList: true, characterData: true })
  })
  await page.goto('http://localhost:4173/seeni/')
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Hyväksyn' }).click()
  await expect(page.locator('#status')).toContainText('Valmis', { timeout: 100_000 })
  const texts = await page.evaluate(() => (window as unknown as { statusTexts: string[] }).statusTexts)
  const percents = texts.flatMap((s) => /^Ladataan mallia… (\d+) %$/.exec(s)?.slice(1) ?? []).map(Number)
  expect(percents.length).toBeGreaterThan(1)
  expect(percents).toEqual([...percents].sort((a, b) => a - b))
  expect(Math.max(...percents)).toBeGreaterThan(50)
  expect(Math.max(...percents)).toBeLessThanOrEqual(99)
})

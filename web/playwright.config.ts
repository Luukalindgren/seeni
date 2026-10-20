import { defineConfig, devices } from '@playwright/test'

// Two servers: the dev server for the parity page (not part of the build), and a preview of
// the production build for the offline test. Run `npm run test:e2e`, which builds first.
export default defineConfig({
  testDir: 'e2e',
  timeout: 120_000,
  fullyParallel: false,
  reporter: process.env.CI ? 'list' : 'line',
  use: { ...devices['Desktop Chrome'] },
  webServer: [
    { command: 'npm run dev -- --port 5173 --strictPort', url: 'http://localhost:5173/seeni/', reuseExistingServer: !process.env.CI },
    { command: 'npm run preview -- --port 4173 --strictPort', url: 'http://localhost:4173/seeni/', reuseExistingServer: !process.env.CI },
  ],
})

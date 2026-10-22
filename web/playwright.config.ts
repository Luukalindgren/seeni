import { defineConfig, devices } from '@playwright/test'

// Two servers: the dev server for the parity page (not part of the build), and a preview of
// the production build for the offline test. Run `npm run test:e2e`, which builds first.
export default defineConfig({
  testDir: 'e2e',
  timeout: 120_000,
  fullyParallel: false,
  reporter: process.env.CI ? 'list' : 'line',
  // Finnish, the default language; e2e/lang.spec.ts tests English.
  use: { ...devices['Desktop Chrome'], locale: 'fi-FI' },
  webServer: [
    { command: 'npm run dev -- --port 5173 --strictPort', url: 'http://localhost:5173/', reuseExistingServer: !process.env.CI },
    { command: 'npm run preview -- --port 4173 --strictPort', url: 'http://localhost:4173/', reuseExistingServer: !process.env.CI },
  ],
})

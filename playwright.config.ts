import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  reporter: 'line',
  outputDir: './test-results',
  use: { headless: true, viewport: { width: 1280, height: 900 }, screenshot: 'off', trace: 'off', video: 'off' },
})

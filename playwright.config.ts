import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:5173', trace: 'retain-on-failure' },
  expect: { timeout: 15_000, toHaveScreenshot: { maxDiffPixelRatio: 0.01 } },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'phone',
      use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, hasTouch: true },
      grep: /@phone/,
    },
  ],
  webServer: [
    {
      command: 'pnpm --filter @specdiff/app dev',
      url: 'http://localhost:5173/app/',
      reuseExistingServer: true,
    },
    {
      // Website (apps/website): static build served by astro preview. Website tests use absolute URLs.
      command: 'pnpm --filter @specdiff/website build && pnpm --filter @specdiff/website exec astro preview --port 4321',
      url: 'http://localhost:4321/',
      reuseExistingServer: true,
      timeout: 180_000,
    },
  ],
});

import { defineConfig, devices } from '@playwright/test';

/**
 * SPEC-FE-04: the journeys run against the local stack (growercare-local-platform, profiles events, grower, catalog,
 * gateway, web): grower-web :5173 and staff-console :5174 are the nginx images, never the Vite dev server (D1).
 * One worker: the journeys share one stack, and J9 compares counts that other journeys would change.
 */
export default defineConfig({
  testDir: './journeys',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 180_000,
  expect: { timeout: 15_000 },
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    ...devices['Desktop Chrome'],
    locale: 'en-US',
    timezoneId: 'Asia/Kolkata',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [{ name: 'chromium' }],
});

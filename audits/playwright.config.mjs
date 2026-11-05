// Playwright suite for Cense Loan Desk. Runs against a production build on port 3100, started automatically
// from the repo root unless AUDIT_URL points somewhere else (another port, a preview deployment).
import { defineConfig } from '@playwright/test';

const PORT = Number(process.env.AUDIT_PORT || 3100);
const baseURL = process.env.AUDIT_URL || `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './tests',
  outputDir: './test-results',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ['list'],
    ['json', { outputFile: 'results/latest/playwright.json' }],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
  ],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: process.env.AUDIT_URL
    ? undefined
    : {
        command: `npm --prefix .. run start -- -p ${PORT}`,
        url: baseURL,
        reuseExistingServer: true,
        timeout: 60_000,
      },
});

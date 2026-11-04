import { test, expect, openApp, goTo, sections, currentSection, PHONE } from './helpers.mjs';

test('first run shows the headline and the way in', async ({ page }) => {
  await openApp(page, { seeded: false });
  await expect(page.getByRole('heading', { name: 'Every loan you have, on one screen.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add my first loan' })).toBeVisible();
});

test('a returning borrower lands on their loans and can reach every section', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await openApp(page);
  await expect(sections(page)).toBeVisible();
  const labels = { plans: 'Plans', payoff: 'Payoff', records: 'Records', loans: 'Loans' };
  for (const tab of ['plans', 'payoff', 'records', 'loans']) {
    await goTo(page, tab);
    await expect(currentSection(page)).toHaveCount(1);
    await expect(currentSection(page)).toContainText(labels[tab]);
  }
});

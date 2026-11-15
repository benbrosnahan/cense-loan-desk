// Shared helpers for the Playwright suite. Each test gets a fresh browser context, so storage starts empty.
import { test, expect } from '@playwright/test';
import { KEYS, LOANS, PROFILE, SNAPSHOTS } from '../lib/fixtures.mjs';

export { test, expect, KEYS, LOANS, PROFILE, SNAPSHOTS };

export const HIDE_KEY = 'cense.loandesk.hideAmounts.v1';
export const WIDTHS = [320, 375, 768, 1024, 1440];
export const PHONE = { width: 375, height: 812 };
export const DESKTOP = { width: 1440, height: 900 };

/**
 * Marks a test as a known issue from audits/ROADMAP.md. The test asserts the fixed behaviour, so today it fails
 * and Playwright counts that as expected. Once the issue is fixed, Playwright reports "expected to fail, but
 * passed": delete the knownIssue() call and close the item. AUDIT_SHOW_KNOWN=1 runs known issues as ordinary
 * tests, which shows the real failure message.
 */
export function knownIssue(id) {
  test.info().annotations.push({ type: 'issue', description: id });
  test.fail(!process.env.AUDIT_SHOW_KNOWN, `Known issue ${id}: see audits/ROADMAP.md`);
}

/**
 * Seeds localStorage before the app's code runs. It runs once per page, so a reload keeps what the app saved.
 * Pass null to leave a key unset. A second page in the same context is not seeded, which multi-tab tests rely on.
 */
export async function seed(page, { loans = LOANS, profile = PROFILE, snapshots = SNAPSHOTS, hideAmounts = null } = {}) {
  await page.addInitScript(({ keys, data }) => {
    if (sessionStorage.getItem('audit.seeded')) return;
    sessionStorage.setItem('audit.seeded', '1');
    for (const [key, value] of Object.entries(data)) {
      if (value === null || value === undefined) continue;
      localStorage.setItem(keys[key], typeof value === 'string' ? value : JSON.stringify(value));
    }
  }, { keys: { ...KEYS, hideAmounts: HIDE_KEY }, data: { loans, profile, snapshots, hideAmounts } });
}

/** Opens the app and waits until it has hydrated: #main only exists once the skeleton is gone. */
export async function openApp(page, { seeded = true, ...data } = {}) {
  if (seeded) await seed(page, data);
  await page.goto('/');
  await page.locator('#main').waitFor();
}

const TAB_NAMES = {
  loans: /^(Your loans|Loans)\b/,
  plans: /^(Repayment plans|Plans)\b/,
  payoff: /^Payoff\b/,
  // The count of saved records is part of this button's name, with no space: "Records2".
  records: /^Records/,
};

export const sections = page => page.getByRole('navigation', { name: 'Sections' });

/** The section button marked aria-current="page". getByRole has no option for aria-current. */
export const currentSection = page => sections(page).locator('[aria-current="page"]');

/** Switches section the way a person does, and waits for the smooth scroll to settle. */
export async function goTo(page, tab) {
  await sections(page).getByRole('button', { name: TAB_NAMES[tab] }).click();
  await settle(page);
}

/** Waits until scroll position has stopped changing, so a click does not land mid-scroll. */
export async function settle(page) {
  await page.waitForFunction(() => new Promise(resolve => {
    let last = scrollY;
    let still = 0;
    const tick = () => {
      if (scrollY === last) still++; else { still = 0; last = scrollY; }
      if (still >= 6) resolve(true); else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }));
}

/** Reads the stored value of one of the app's keys. */
export const stored = (page, key) => page.evaluate(k => JSON.parse(localStorage.getItem(k) ?? 'null'), key);

// One browser binary for everything: Playwright's Chromium, driven by Playwright in tests/ and by
// puppeteer-core in the scan engines (Lighthouse needs a Puppeteer page). Run `npm run setup` once to download it.
import puppeteer from 'puppeteer-core';
import { chromium } from '@playwright/test';

export const chromePath = () => process.env.CHROME_PATH || chromium.executablePath();

export const CHROME_ARGS = ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'];

export function launchBrowser(extraArgs = []) {
  return puppeteer.launch({ headless: true, executablePath: chromePath(), args: [...CHROME_ARGS, ...extraArgs] });
}

export const sleep = ms => new Promise(r => setTimeout(r, ms));

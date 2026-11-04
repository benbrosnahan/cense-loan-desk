// Shared fixtures: an eight-loan undergrad portfolio (user-owned ids, so no "example" banner),
// the app's localStorage keys, and helpers that drive the app into each audited state.
export const KEYS = {
  loans: 'cense.loandesk.loans.v1',
  profile: 'cense.loandesk.profile.v2',
  snapshots: 'cense.loandesk.snapshots.v1',
};

const L = (id, nickname, servicer, kind, principal, balance, rate, date) => ({
  id, nickname, servicer, kind,
  subsidy: kind === 'direct_sub' ? 'subsidized' : 'unsubsidized',
  principal, balance, rate, disbursementDate: date, minPayment: 0,
});

export const LOANS = [
  L('u-1s', '2022–23 subsidized', 'Nelnet', 'direct_sub', 3500, 3500, 4.99, '2022-09-01'),
  L('u-1u', '2022–23 unsubsidized', 'Nelnet', 'direct_unsub', 2000, 2396, 4.99, '2022-09-01'),
  L('u-2s', '2023–24 subsidized', 'Nelnet', 'direct_sub', 4500, 4500, 5.5, '2023-09-01'),
  L('u-2u', '2023–24 unsubsidized', 'Nelnet', 'direct_unsub', 2000, 2326, 5.5, '2023-09-01'),
  L('u-3s', '2024–25 subsidized', 'MOHELA', 'direct_sub', 5500, 5500, 6.53, '2024-09-01'),
  L('u-3u', '2024–25 unsubsidized', 'MOHELA', 'direct_unsub', 2000, 2256, 6.53, '2024-09-01'),
  L('u-4s', '2025–26 subsidized', 'MOHELA', 'direct_sub', 5500, 5500, 6.39, '2025-09-01'),
  L('u-4u', '2025–26 unsubsidized', 'MOHELA', 'direct_unsub', 2000, 2123, 6.39, '2025-09-01'),
];

export const PROFILE = {
  income: 52000, householdSize: 1, employment: 'nonprofit', goal: 'least_total',
  extraPerMonth: 100, selectedPlan: 'standard',
};

const shifted = LOANS.map(l => (l.id === 'u-3u' ? { ...l, balance: 2401, rate: 6.53 } : l));
export const SNAPSHOTS = [
  { takenAt: '2026-08-01T15:00:00.000Z', loans: LOANS, totalBalance: LOANS.reduce((s, l) => s + l.balance, 0) },
  { takenAt: '2026-10-01T15:00:00.000Z', loans: shifted, totalBalance: shifted.reduce((s, l) => s + l.balance, 0) },
];

/** Script for evaluateOnNewDocument: seeds localStorage before any app code runs. */
export function seedScript({ loans = LOANS, profile = PROFILE, snapshots = SNAPSHOTS } = {}) {
  return `(() => { try {
    localStorage.setItem(${JSON.stringify(KEYS.loans)}, ${JSON.stringify(JSON.stringify(loans))});
    localStorage.setItem(${JSON.stringify(KEYS.profile)}, ${JSON.stringify(JSON.stringify(profile))});
    localStorage.setItem(${JSON.stringify(KEYS.snapshots)}, ${JSON.stringify(JSON.stringify(snapshots))});
  } catch {} })();`;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

/** Click a control by its exact trimmed visible text with a real (trusted) mouse click. */
export async function clickText(page, text) {
  const handle = await page.evaluateHandle(t => {
    const norm = s => (s || '').replace(/\s+/g, ' ').trim();
    const els = [...document.querySelectorAll('button, a, [role="radio"]')];
    return els.find(e => norm(e.innerText) === t && e.offsetParent !== null)
      || els.find(e => norm(e.innerText).startsWith(t) && e.offsetParent !== null)
      || null;
  }, text);
  const el = handle.asElement();
  if (!el) throw new Error(`clickText: no visible control "${text}"`);
  await el.click();
  await sleep(350);
}

/** Tab labels differ by breakpoint: label below sm, long at sm and up. */
export const TAB_LABELS = {
  loans: ['Your loans', 'Loans'],
  plans: ['Repayment plans', 'Plans'],
  payoff: ['Payoff', 'Payoff'],
  records: ['Records', 'Records'],
};

export async function clickTab(page, tab) {
  const [long, short] = TAB_LABELS[tab];
  const handle = await page.evaluateHandle((long, short) => {
    const nav = document.querySelector('nav[aria-label="Sections"]');
    if (!nav) return null;
    const norm = s => (s || '').replace(/\s+/g, ' ').trim();
    return [...nav.querySelectorAll('button')].find(b => {
      const t = norm(b.innerText);
      return t === long || t === short || t.startsWith(long) || t.startsWith(short);
    }) || null;
  }, long, short);
  const el = handle.asElement();
  if (!el) throw new Error(`clickTab: no section button for ${tab}`);
  await el.click();
  await sleep(400);
}

/**
 * The audited states. `seeded: true` means localStorage is pre-populated before load;
 * `enter` then drives the UI into the state with real clicks.
 */
export const STATES = {
  empty: { seeded: false, enter: async () => {} },
  'form-errors': {
    seeded: false,
    enter: async page => {
      await clickText(page, 'Add my first loan');
      await clickText(page, 'Save loan');
    },
  },
  loans: { seeded: true, enter: async () => {} },
  plans: { seeded: true, enter: async page => clickTab(page, 'plans') },
  payoff: { seeded: true, enter: async page => clickTab(page, 'payoff') },
  records: { seeded: true, enter: async page => clickTab(page, 'records') },
};

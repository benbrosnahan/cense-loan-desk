---
description: Review the app's real screens as a stressed borrower would, and merge the findings into the audit scores
---
The scanner in `audits/` measures what a rule can measure. You add what only looking can: is the next step obvious to someone anxious about money and reading on a phone?

1. Make sure screens are current: from `audits/`, run `node run.mjs --only ux`. That writes, for each state (`empty`, `form-errors`, `loans`, `plans`, `payoff`, `records`) and form factor (`desktop`, `mobile`), `results/latest/ux/<state>-<form factor>.jpg`, `.dom.json` (real elements with sizes, colors and text) and `.json` (rule findings already found).
2. For each tag, read the screenshot and the DOM file, and write `results/latest/ux/ai/<tag>.json`: a JSON array of findings.

Each finding:
```json
{
  "severity": "P1 | P2 | P3",
  "category": "Typography | Color/Contrast | Layout | Spacing | Visual Hierarchy | Mobile Responsiveness | Navigation | CTA | Content | Imagery | Accessibility | Consistency | Forms | Performance Indicators",
  "title": "Short statement of the defect",
  "description": "What is wrong here and who it hurts",
  "recommendation": "The exact change",
  "scope": "page | element",
  "evidence": { "measured": "a number from the DOM file", "required": "the threshold", "selector": "the element", "sample": "its text", "count": 3 },
  "hypothesis": false
}
```

Rules for honest findings:
- P1 needs a real number in `evidence.measured`; without one it is capped at P2 when merged. Set `hypothesis: true` for anything you infer but cannot point to.
- Only report what you can see in this state. Do not report what might be below the fold, or a page you were not shown.
- Do not repeat a rule finding that is already in the `.json` file. Do not treat Material 3 conventions as law: this app does not use Material.
- This product deliberately has no analytics, accounts or marketing funnel, starts empty, starts extra payment at $0, and keeps payoff order off the main view. Those are decisions, not defects.
- Ask of each screen: can a first-time borrower tell what to do next? Are money figures stated in words as well as shown? Could example data be mistaken for real? Would someone trust this with their finances?

3. Run `node lib/merge-ux.mjs results/latest/ux`, then report `results/latest/ux/merged/summary.json` (scores by state) and the highest-severity findings that are new. An empty array for a screen that is fine is a valid result.

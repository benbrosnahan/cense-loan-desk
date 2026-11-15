"use client";

// Cense Loan Desk — shown if the page throws while it updates. Created with
// Claude Code.
//
// Browser translation is the known cause: the translator swaps out text React
// still holds, and React throws when it next edits that text. Without this
// file Next replaces the whole page with a bare error and no way back.

import { Button } from "@/components/shared/ui";

export default function PageError({ reset }: { reset: () => void }) {
  return (
    <main className="min-h-screen bg-page">
      <div className="mx-auto max-w-3xl px-4 pt-16 sm:px-6">
        <h1 className="font-display text-3xl font-bold leading-tight text-slate-900">
          Something went wrong on this screen
        </h1>
        <p className="mt-3 max-w-xl text-lg leading-relaxed text-slate-700">
          Your saved loans are still in this browser. Try again to reopen Loan
          Desk.
        </p>
        <div className="mt-7">
          <Button onClick={() => reset()}>Try again</Button>
        </div>
      </div>
    </main>
  );
}

import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Instrument_Sans } from "next/font/google";
import "./globals.css";

// Two faces, shared with Decode so the Cense tools read as one family.
// Bricolage carries headlines and headline figures. Instrument Sans carries
// everything that gets read or compared, and has true tabular figures.
const display = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});
const sans = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Loan Desk by Cense — every student loan you have, in one place",
  description:
    "Put all your federal student loans on one screen: balances, rates, which repayment plans you actually qualify for, and which loan to attack first. Free, private, and nothing to sell.",
  openGraph: {
    title: "Loan Desk by Cense",
    description:
      "Every federal student loan you have, on one screen. Balances, rates, eligible repayment plans, and payoff order.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Loan Desk by Cense",
    description: "Every federal student loan you have, on one screen.",
  },
};

export const viewport: Viewport = {
  themeColor: "#FFFCEC",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${display.variable} ${sans.variable} font-sans`}>
        <noscript>
          <div style={{ padding: "2rem", textAlign: "center" }}>
            Loan Desk needs JavaScript to run. Please enable it in your browser
            settings.
          </div>
        </noscript>
        {children}
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

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

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} font-sans`}>
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

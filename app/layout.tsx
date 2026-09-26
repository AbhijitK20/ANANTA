import type { Metadata } from "next";
import "./globals.css";

/**
 * The meta description used to read "Find verified local experiences". About 96
 * percent of the catalogue is generated, with hash-derived prices and durations,
 * and `lib/data/factory.ts` says so in its own confidence string. This is the
 * first line any visitor or crawler reads, so it now describes what the product
 * actually does, which is the thing it is proud of.
 */
export const metadata: Metadata = {
  title: "Ananta | Mumbai and Navi Mumbai",
  description:
    "Find local places in Mumbai and Navi Mumbai that fit the time, budget, and route you actually have, and see the proof: every recommendation shows its ranked score components, every refusal shows the number that caused it, and every fact says where it came from.",
  icons: { icon: "/favicon.png" },
  /**
   * Social preview. `SESSION/00-CONTRACTS.md` flagged that only title,
   * description and icons existed while social preview was specified and never
   * implemented.
   *
   * No `images` key anywhere below, on purpose. `SESSION/00-CONTRACTS.md` says
   * to omit the key rather than point at a file that is not on disk, and a 1200
   * by 630 social card does not exist in `public/`. Every image that does exist
   * is one of the 70 area photos shared across 1,090 records, and
   * `docs/05-design/DESIGN-CONTRACT.md:25` bans stock-like imagery presented as
   * a real place. An unfilled card is the honest state; a wrong one is a lie.
   */
  openGraph: {
    type: "website",
    siteName: "Ananta",
    title: "Ananta | Fit-first local discovery",
    description:
      "A feasibility gate checks your time, budget and route before anything is ranked, then shows the score that placed each place and the number that refused the rest.",
    locale: "en_IN",
  },
  twitter: {
    card: "summary",
    title: "Ananta | Fit-first local discovery",
    description:
      "Every recommendation shows its ranked score components. Every refusal shows the number that caused it. Every fact says where it came from.",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <a href="#main-content" className="skip-link">Skip to main content</a>
        {children}
      </body>
    </html>
  );
}

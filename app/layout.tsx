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

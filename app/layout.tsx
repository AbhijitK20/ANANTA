import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ananta | Mumbai and Navi Mumbai",
  description: "Find verified local experiences, places, and events that fit your time, budget, and route.",
  icons: { icon: "/favicon.svg" },
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

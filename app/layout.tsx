import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "CDM — Deal Coordination",
  description: "Turn sales calls into coordinated deal action across Engineering, Finance, and Legal.",
  openGraph: {
    title: "CDM — Deal Coordination",
    description: "Turn sales calls into coordinated deal action across Engineering, Finance, and Legal.",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

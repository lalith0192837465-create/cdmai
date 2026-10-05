import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CDM — Deal coordination without the handoff",
  description: "Turn sales calls into coordinated deal action",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}

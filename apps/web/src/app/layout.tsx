import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SiteAnswer - AI Call Handler for Builders",
  description:
    "AI-powered voice call handler for construction businesses. Every call answered, every lead captured.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

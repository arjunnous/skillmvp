import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "World Clock",
  description: "Live world clock for top 12 countries with time zone converter",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased">{children}</body>
    </html>
  );
}

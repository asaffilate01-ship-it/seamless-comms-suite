import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Omniqora Control by iTechLounge",
  description: "Private intelligence control plane and client add-on platform for the iTechLounge portfolio.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}

import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "QR Business Manager", template: "%s · QR Business Manager" },
  description: "Manage QR and NFC cards, their destinations and their scan history.",
  // Relative URLs only, so the build never needs the deployment URL.
  openGraph: {
    type: "website",
    siteName: "QR Business Manager",
    title: "QR Business Manager",
    description: "Manage QR and NFC cards, their destinations and their scan history.",
  },
  twitter: { card: "summary" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f7f7f8",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}

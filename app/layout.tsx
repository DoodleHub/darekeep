import type { Metadata, Viewport } from "next";
import { Pixelify_Sans, Space_Grotesk } from "next/font/google";
import "./globals.css";

const pixel = Pixelify_Sans({
  variable: "--font-pixel",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const body = Space_Grotesk({
  variable: "--font-body",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Darekeep — Build tiny dungeons. Dare your friends.",
  description: "Get the key. Reach the exit. Beat your best. A bite-sized action dungeon game where you build traps and challenge friends.",
};

export const viewport: Viewport = {
  themeColor: "#0b0915",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${pixel.variable} ${body.variable} h-full antialiased`}>
      <body className="min-h-full dk-backdrop dk-grain">{children}</body>
    </html>
  );
}

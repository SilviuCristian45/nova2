import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Setările pentru culorile telefonului (Status bar)
export const viewport: Viewport = {
  themeColor: "#000000", // Schimbă cu culoarea ta principală dacă vrei (ex: codul de la bg-background)
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false, // Împiedică zoom-ul pe mobil când apeși rapid butoane
};

export const metadata: Metadata = {
  title: "Workout Tracker Pro",
  description: "Aplicația mea de fitness și antrenamente",
  manifest: "/manifest.json", // <-- Asta leagă fișierul creat la Pasul 3
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Workouts",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}

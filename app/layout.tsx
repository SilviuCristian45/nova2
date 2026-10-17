import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "./components/theme-provider";
import { ThemeToggle } from "./components/theme-toggle";
import { LanguageProvider, LanguageSelector } from "./components/language-provider";
import { getLanguage } from "./language";

export const metadata: Metadata = {
  title: 'Aplicatia Mea',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Aplicatia Mea',
  },
}

export const viewport: Viewport = {
  themeColor: '#ffffff',
}

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
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafafa" },
    { media: "(prefers-color-scheme: dark)", color: "#09090b" },
  ],
  width: "device-width",
  initialScale: 1,
};

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getLanguage();
  return {
    title: "Workout Tracker Pro",
    description: t("Monitorizarea activității fizice, nutriției și antrenamentelor", "Fitness, nutrition and workout tracking"),
    manifest: "/manifest.json",
    appleWebApp: {
      capable: true,
      statusBarStyle: "default",
      title: t("Antrenamente", "Workouts"),
    },
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { language } = await getLanguage();
  return (
    <html
      lang={language}
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider
          attribute="class"
          defaultTheme="system" // Poate fi "light", "dark" sau "system" (ia setarea iOS/Android)
          enableSystem
          disableTransitionOnChange
        >
          <LanguageProvider initialLanguage={language}>
            <div className="mx-auto flex w-full max-w-7xl justify-end gap-2 px-5 pt-3 sm:px-8">
              <LanguageSelector />
              <ThemeToggle />
            </div>
            {children}
          </LanguageProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

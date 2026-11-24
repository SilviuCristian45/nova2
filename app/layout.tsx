import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "./components/theme-provider";
import { ThemeToggle } from "./components/theme-toggle";
import { LanguageProvider, LanguageSelector } from "./components/language-provider";
import { getLanguage } from "./language";
import { getWeightUnit } from "./units";
import { UnitsProvider } from "./components/units-provider";
import { OfflineProvider } from "@/lib/offline/client";
import { OfflineStatus } from "./components/offline-status";
import { DriveAutoSync } from "./components/drive-auto-sync";
import { NotificationBell } from "./components/notification-bell";
import { driveConfigured } from "@/lib/google-drive";
import { createClient } from "@/lib/supabase/server";
import { pageWidth } from "./components/ui";

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
    { media: "(prefers-color-scheme: light)", color: "#f5f4ef" },
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
  const weightUnit = await getWeightUnit();

  let initialUnread = 0;
  let signedIn = false;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      signedIn = true;
      const { count } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .is("read_at", null);
      initialUnread = count ?? 0;
    }
  } catch {
    // Gracefully skip if unauthenticated or offline shell.
  }

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
            <UnitsProvider initialUnit={weightUnit}>
            <OfflineProvider>
            <div className={`${pageWidth} no-print flex items-center justify-end gap-2 px-5 pt-3 lg:px-8`}>
              {signedIn && <NotificationBell initialUnread={initialUnread} />}
              <LanguageSelector />
              <ThemeToggle />
            </div>
            <OfflineStatus />
            {driveConfigured() && <DriveAutoSync />}
            {children}
            </OfflineProvider>
            </UnitsProvider>
          </LanguageProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Space_Grotesk } from "next/font/google";
import RegisterSW from "@/components/RegisterSW";
import TabBar from "@/components/TabBar";
import { LanguageProvider } from "@/components/LanguageProvider";
import { getLang } from "@/lib/i18n/server";
import { t } from "@/lib/i18n";
import "./globals.css";

const bricolage = Bricolage_Grotesque({
  variable: "--font-display",
  subsets: ["latin"],
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-ui",
  subsets: ["latin"],
});

// Metadata dynamique : la description suit la langue du cookie (défaut fr).
export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "What Shall We Play?",
    description: t(await getLang(), "meta.description"),
    icons: {
      icon: "/icons/icon-192.png",
      apple: "/icons/apple-touch-icon.png",
    },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#2A1F17",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const lang = await getLang();
  return (
    <html lang={lang} className={`${bricolage.variable} ${spaceGrotesk.variable}`}>
      <body>
        <LanguageProvider lang={lang}>
          {children}
          <TabBar />
          <RegisterSW />
        </LanguageProvider>
      </body>
    </html>
  );
}

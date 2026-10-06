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
// metadataBase rend les og: absolus (les scrapers WhatsApp/Slack n'aiment pas le relatif) ;
// PUBLIC_URL est posée sur le VPS, le fallback suit le domaine courant.
export async function generateMetadata(): Promise<Metadata> {
  const description = t(await getLang(), 'meta.description');
  return {
    metadataBase: new URL(process.env.PUBLIC_URL || 'https://what-shall-we-play.marco-studio.fr'),
    title: 'What Shall We Play?',
    description,
    icons: {
      icon: [
        { url: '/icons/icon.svg', type: 'image/svg+xml' },
        { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      ],
      apple: '/icons/apple-touch-icon.png',
    },
    openGraph: {
      title: 'What Shall We Play?',
      description,
      siteName: 'What Shall We Play?',
      type: 'website',
      images: [{ url: '/icons/icon-512.png', width: 512, height: 512, alt: 'What Shall We Play?' }],
    },
    twitter: { card: 'summary' },
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

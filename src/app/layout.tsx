import type { Metadata } from "next";
import "@fontsource/dotgothic16";
import "./globals.css";
import "./pages.css";
import { t } from "@/i18n";
import { getLocale } from "@/lib/locale";

export async function generateMetadata(): Promise<Metadata> {
  return { title: t(await getLocale(), "app.name") };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang={await getLocale()}>
      <body className="text-neutral-900">{children}</body>
    </html>
  );
}

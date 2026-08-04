import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { siteConfig } from "@/lib/site-config";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
const DESCRICAO_PADRAO = "Encontre o imóvel ideal para comprar ou alugar.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: siteConfig.nome,
    template: `%s | ${siteConfig.nome}`,
  },
  description: DESCRICAO_PADRAO,
  openGraph: {
    type: "website",
    locale: "pt_BR",
    siteName: siteConfig.nome,
    title: siteConfig.nome,
    description: DESCRICAO_PADRAO,
  },
  twitter: {
    card: "summary_large_image",
    title: siteConfig.nome,
    description: DESCRICAO_PADRAO,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}

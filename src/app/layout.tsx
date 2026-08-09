import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { siteConfig } from "@/lib/site-config";
import { getSiteUrl } from "@/lib/site-url";
import { TooltipProvider } from "@/components/ui/tooltip";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const DESCRICAO_PADRAO = "Encontre o imóvel ideal para comprar ou alugar.";

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl("")),
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
      <body className="min-h-full flex flex-col">
        <TooltipProvider>{children}</TooltipProvider>
      </body>
    </html>
  );
}

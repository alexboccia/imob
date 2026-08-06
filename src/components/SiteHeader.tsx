"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { AnimatePresence, motion } from "motion/react";
import { IconeMenu, IconeFechar } from "@/components/icons";
import { Button } from "@/components/ui/button";

type NavLink = { href: string; label: string };

export function SiteHeader({
  nome,
  logo,
  logoAltura,
  navLinks,
}: {
  nome: string;
  logo?: string | null;
  logoAltura?: number | null;
  navLinks: NavLink[];
}) {
  const [aberto, setAberto] = useState(false);
  const altura = logoAltura && logoAltura > 0 ? logoAltura : 40;
  const largura = Math.min(altura * 4, 280);

  return (
    <header className="border-b sticky top-0 bg-background z-10">
      <div className="mx-auto max-w-6xl flex items-center justify-between px-4 py-4">
        <Link
          href="/"
          className="flex items-center"
          onClick={() => setAberto(false)}
        >
          {logo ? (
            <span
              className="relative block shrink-0"
              style={{ height: altura, width: largura }}
            >
              <Image
                src={logo}
                alt={nome}
                fill
                sizes={`${largura}px`}
                className="object-contain object-left"
                priority
              />
            </span>
          ) : (
            <span className="font-semibold text-lg">{nome}</span>
          )}
        </Link>

        <nav className="hidden sm:flex gap-6 text-sm">
          {navLinks.map((link) => (
            <Link key={link.href} href={link.href} className="hover:underline">
              {link.label}
            </Link>
          ))}
        </nav>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => setAberto((a) => !a)}
          aria-label={aberto ? "Fechar menu" : "Abrir menu"}
          aria-expanded={aberto}
          className="sm:hidden"
        >
          {aberto ? (
            <IconeFechar className="w-6 h-6" />
          ) : (
            <IconeMenu className="w-6 h-6" />
          )}
        </Button>
      </div>

      <AnimatePresence initial={false}>
        {aberto && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="sm:hidden overflow-hidden border-t bg-background"
          >
            <nav className="px-4 py-3 flex flex-col gap-1 text-sm">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="py-2"
                  onClick={() => setAberto(false)}
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}

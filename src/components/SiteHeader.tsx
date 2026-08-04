"use client";

import { useState } from "react";
import Link from "next/link";
import { IconeMenu, IconeFechar } from "@/components/icons";

type NavLink = { href: string; label: string };

export function SiteHeader({
  nome,
  navLinks,
}: {
  nome: string;
  navLinks: NavLink[];
}) {
  const [aberto, setAberto] = useState(false);

  return (
    <header className="border-b sticky top-0 bg-background z-10">
      <div className="mx-auto max-w-6xl flex items-center justify-between px-4 py-4">
        <Link
          href="/"
          className="font-semibold text-lg"
          onClick={() => setAberto(false)}
        >
          {nome}
        </Link>

        <nav className="hidden sm:flex gap-6 text-sm">
          {navLinks.map((link) => (
            <Link key={link.href} href={link.href} className="hover:underline">
              {link.label}
            </Link>
          ))}
        </nav>

        <button
          type="button"
          onClick={() => setAberto((a) => !a)}
          aria-label={aberto ? "Fechar menu" : "Abrir menu"}
          aria-expanded={aberto}
          className="sm:hidden w-9 h-9 flex items-center justify-center shrink-0"
        >
          {aberto ? (
            <IconeFechar className="w-6 h-6" />
          ) : (
            <IconeMenu className="w-6 h-6" />
          )}
        </button>
      </div>

      {aberto && (
        <nav className="sm:hidden border-t px-4 py-3 flex flex-col gap-1 text-sm bg-background">
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
      )}
    </header>
  );
}

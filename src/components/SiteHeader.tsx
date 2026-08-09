"use client";

import { useEffect, useRef, useState } from "react";
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
  basePath,
}: {
  nome: string;
  logo?: string | null;
  logoAltura?: number | null;
  navLinks: NavLink[];
  basePath: string;
}) {
  const [aberto, setAberto] = useState(false);
  const altura = logoAltura && logoAltura > 0 ? logoAltura : 40;
  const largura = Math.min(altura * 4, 280);
  const headerRef = useRef<HTMLElement>(null);

  // A altura real do header varia com logoAltura (configurável por
  // organização) e com a quebra do menu mobile — outros elementos sticky
  // (ex: FiltrosImoveis) precisam saber essa altura pra colar logo abaixo
  // dele, não por baixo. Expõe como custom property em vez de prop
  // drilling, já que quem consome não é filho do header.
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      document.documentElement.style.setProperty(
        "--site-header-height",
        `${entry.contentRect.height}px`
      );
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <header
      ref={headerRef}
      // z-30: precisa ficar acima de qualquer conteúdo que role por baixo
      // (ex: badges "Destaque"/"Oportunidade" dos cards de imóvel, também
      // absolutamente posicionados com z-index próprio) — com z-index
      // empatado, o desempate do navegador é por ordem no DOM, e esse
      // conteúdo vem depois do header, então venceria o empate e pintaria
      // por cima dele durante o scroll.
      className="border-b sticky top-0 bg-background z-30"
    >
      <div className="mx-auto max-w-6xl flex items-center justify-between px-4 py-4">
        <Link
          href={basePath || "/"}
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

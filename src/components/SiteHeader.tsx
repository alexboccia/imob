"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { IconeMenu, IconeFechar } from "@/components/icons";
import { Button } from "@/components/ui/button";

type NavLink = { href: string; label: string };

// Proposta 2 — header com mais presença visual (altura/logo/fonte
// maiores, item ativo destacado) em vez do menu pequeno anterior. Mesmas
// rotas reais de sempre (navLinks vem de [orgSlug]/layout.tsx, nenhum
// link novo/fictício), mesmo mecanismo de Sheet mobile (agora com
// AnimatePresence, já existia).
function estaAtivo(href: string, pathname: string, searchAtual: string): boolean {
  const [caminho, query] = href.split("?");
  if (pathname !== caminho) return false;
  if (!query) return true;
  // Compara só os parâmetros presentes no link (ex: finalidade=SALE) —
  // um link "Comprar" não precisa saber sobre outros filtros que o
  // usuário possa ter adicionado na URL atual.
  const paramsLink = new URLSearchParams(query);
  const paramsAtuais = new URLSearchParams(searchAtual);
  return Array.from(paramsLink.entries()).every(
    ([chave, valor]) => paramsAtuais.get(chave) === valor
  );
}

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
  const altura = logoAltura && logoAltura > 0 ? logoAltura : 48;
  const largura = Math.min(altura * 4, 280);
  const headerRef = useRef<HTMLElement>(null);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchAtual = searchParams.toString();

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
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:py-6">
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
            <span className="text-xl font-bold tracking-tight">{nome}</span>
          )}
        </Link>

        {/* gap menor que o de antes (era gap-8) porque agora cada item tem
            padding horizontal próprio — o espaçamento ÓPTICO entre os
            rótulos continua equivalente, mas o contorno do item ativo
            ganha respiro em vez de colar no texto. A borda existe nos três
            estados (transparente quando inativo, cor do tenant quando
            ativo) pra trocar de item não deslocar nada — mesmo padrão do
            Button do projeto. Cor vem de `border-primary`/`text-primary`,
            que resolvem pra --primary injetada por organização em
            [orgSlug]/layout.tsx: nada hardcoded, acompanha a paleta de
            qualquer tenant. */}
        <nav className="hidden items-center gap-1 sm:flex">
          {navLinks.map((link) => {
            const ativo = estaAtivo(link.href, pathname, searchAtual);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={ativo ? "page" : undefined}
                className={`rounded-full border px-4 py-2 text-base font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 ${
                  ativo
                    ? "border-primary text-primary"
                    : "border-transparent text-gray-700 hover:bg-primary/5 hover:text-primary"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
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
            <nav className="flex flex-col gap-1 px-4 py-3">
              {navLinks.map((link) => {
                const ativo = estaAtivo(link.href, pathname, searchAtual);
                return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={ativo ? "page" : undefined}
                  className={`rounded-md px-2 py-2.5 text-base font-medium ${
                    ativo ? "bg-primary/10 text-primary" : "text-gray-700"
                  }`}
                  onClick={() => setAberto(false)}
                >
                  {link.label}
                </Link>
                );
              })}
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}

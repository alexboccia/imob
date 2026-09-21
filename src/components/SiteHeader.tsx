"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { IconeMenu, IconeFechar, IconeCoracao } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { larguraCaixaLogo } from "@/lib/logo";
import { BarraContatoTopo } from "@/components/BarraContatoTopo";
import type { CanalPublico } from "@/lib/contatos-publicos";
import { useFavoritos } from "@/lib/favoritos-store";
import { cn } from "@/lib/utils";

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

// Fase 49 — contador da central de favoritos: a quantidade SALVA neste
// navegador (a mesma lista do Salvar da ficha), sem consulta nenhuma. Um
// id que deixou de ser público continua contando até sair da lista; a
// página de favoritos é quem filtra. Zero não aparece.
function ContadorFavoritos({ total, className }: { total: number; className?: string }) {
  if (total === 0) return null;
  return (
    <>
      <span
        aria-hidden="true"
        data-contador-favoritos
        className={cn(
          "inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground",
          className
        )}
      >
        {total}
      </span>
      <span className="sr-only">
        , {total} {total === 1 ? "imóvel salvo" : "imóveis salvos"}
      </span>
    </>
  );
}

export function SiteHeader({
  nome,
  logo,
  logoAltura,
  navLinks,
  basePath,
  orgSlug,
  // Fase 58 — canais já RESOLVIDOS para o topo (valor preenchido E flag
  // ligada). Lista vazia é o caso comum e significa "sem barra": o
  // cabeçalho fica exatamente como sempre foi.
  canaisTopo = [],
}: {
  nome: string;
  logo?: string | null;
  logoAltura?: number | null;
  navLinks: NavLink[];
  basePath: string;
  orgSlug: string;
  canaisTopo?: CanalPublico[];
}) {
  const [aberto, setAberto] = useState(false);
  const altura = logoAltura && logoAltura > 0 ? logoAltura : 48;
  const largura = larguraCaixaLogo(altura);
  const headerRef = useRef<HTMLElement>(null);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchAtual = searchParams.toString();
  const favoritos = useFavoritos(orgSlug);
  const totalFavoritos = favoritos?.length ?? 0;
  const hrefFavoritos = `${basePath}/favoritos`;
  const favoritosAtivo = estaAtivo(hrefFavoritos, pathname, searchAtual);

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
      {/* A barra some do DOM quando não há canais — o `&&` aqui e a
          guarda dentro do componente. O ResizeObserver acima mede o
          <header> inteiro, então `--site-header-height` já passa a
          incluir a barra: quem gruda logo abaixo do cabeçalho (os
          filtros da listagem) continua no lugar certo, sem mudança. */}
      {canaisTopo.length > 0 && <BarraContatoTopo canais={canaisTopo} />}
      {/* Fase 49 — gap + min-w-0 no logo: a caixa do logo tem largura
          fixa (até 280px) e, em 320px, ela mais o botão do menu passavam
          da largura útil (288px) — o botão saía 8px para fora da tela.
          Agora a caixa encolhe até caber (a imagem é object-contain, só
          fica menor, nunca cortada) e o botão nunca encolhe. */}
      {/* Fase 58 — com a barra acima, o conjunto não pode ficar alto
          demais: o padding do cabeçalho cede um pouco SÓ quando ela
          existe (py-4/sm:py-5 em vez de py-5/sm:py-6). Sem barra, os
          valores são exatamente os de antes e nada muda de tamanho. */}
      <div
        className={cn(
          "mx-auto flex max-w-6xl items-center justify-between gap-3 px-4",
          canaisTopo.length > 0 ? "py-4 sm:py-5" : "py-5 sm:py-6"
        )}
      >
        <Link
          href={basePath || "/"}
          className="flex min-w-0 items-center"
          onClick={() => setAberto(false)}
          data-logo-site
        >
          {logo ? (
            <span
              className="relative block max-w-full"
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
        {/* Menu horizontal só a partir de md (768px), não de sm (640px):
            com o quarto item ("Anuncie seu imóvel") os rótulos deixam de
            caber ao lado do logo em 640-767px e o nav quebrava em duas
            linhas, esticando o header. Abaixo de md o mesmo menu aparece
            no Sheet, que já existia — nenhum link some, muda só onde ele
            é mostrado. */}
        {/* Fase 49 — Favoritos é o último item, à direita, com o mesmo
            estilo e o mesmo estado ativo dos demais. Entre md e lg não há
            espaço para o rótulo (o "Anuncie seu imóvel" já quebra em
            768px): só o coração, com o nome acessível completo; a partir
            de lg, coração + "Favoritos". Por isso também o padding dos
            itens é menor até lg. */}
        <nav className="hidden shrink-0 items-center gap-1 md:flex">
          {navLinks.map((link) => {
            const ativo = estaAtivo(link.href, pathname, searchAtual);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={ativo ? "page" : undefined}
                className={`rounded-lg border px-3 py-2 text-base font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 lg:px-4 ${
                  ativo
                    ? "border-primary text-primary"
                    : "border-transparent text-gray-700 hover:bg-primary/5 hover:text-primary"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
          <Link
            href={hrefFavoritos}
            data-link-favoritos
            aria-current={favoritosAtivo ? "page" : undefined}
            title="Favoritos"
            className={cn(
              "relative flex items-center gap-2 rounded-lg border px-3 py-2 text-base font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 lg:px-4",
              favoritosAtivo
                ? "border-primary text-primary"
                : "border-transparent text-gray-700 hover:bg-primary/5 hover:text-primary"
            )}
          >
            {/* size-6 enquanto o ícone está sozinho: a mesma altura de
                linha (24px) dos rótulos, para o item ter a altura dos
                outros. */}
            <IconeCoracao className="size-6 shrink-0 lg:size-5" />
            <span className="sr-only lg:not-sr-only">Favoritos</span>
            <ContadorFavoritos
              total={totalFavoritos}
              className="absolute -top-1 -right-1 lg:static"
            />
          </Link>
        </nav>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => setAberto((a) => !a)}
          aria-label={aberto ? "Fechar menu" : "Abrir menu"}
          aria-expanded={aberto}
          className="shrink-0 md:hidden"
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
            className="md:hidden overflow-hidden border-t bg-background"
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
              <Link
                href={hrefFavoritos}
                data-link-favoritos
                aria-current={favoritosAtivo ? "page" : undefined}
                className={`flex items-center gap-2 rounded-md px-2 py-2.5 text-base font-medium ${
                  favoritosAtivo ? "bg-primary/10 text-primary" : "text-gray-700"
                }`}
                onClick={() => setAberto(false)}
              >
                <IconeCoracao className="size-5 shrink-0" />
                Favoritos
                <ContadorFavoritos total={totalFavoritos} />
              </Link>

              {/* Fase 58 — as redes configuradas para o topo ficam
                  ocultas na barra abaixo de sm (não cabem junto do
                  telefone sem estourar 320px). Aqui elas voltam, com
                  rótulo por extenso: dentro do menu há largura para
                  texto, e um ícone solto numa lista vertical de links
                  seria o item menos legível da navegação. Telefone e
                  WhatsApp não se repetem aqui — a barra já os mostra em
                  qualquer largura. */}
              {canaisTopo.filter((c) => c.tipo === "REDE").length > 0 && (
                <div className="mt-1 flex flex-col gap-1 border-t pt-2">
                  {canaisTopo
                    .filter((c) => c.tipo === "REDE")
                    .map((canal) => (
                      <a
                        key={canal.chave}
                        href={canal.href}
                        data-canal-menu={canal.chave}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-md px-2 py-2.5 text-base font-medium text-gray-700"
                        onClick={() => setAberto(false)}
                      >
                        {canal.rotulo}
                      </a>
                    ))}
                </div>
              )}
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { ICONES_NAV, type ChaveIconeNav } from "@/components/admin/icones-nav";

export type ItemNavAdmin = {
  href: string;
  label: string;
  liberado: boolean;
  icone: ChaveIconeNav;
};

// Navegação da sidebar desktop (Fase 62).
//
// Extraída do <aside> em src/app/app/layout.tsx por uma razão concreta: o
// layout é um Server Component e não tem `usePathname`, então o desktop
// era o único lugar do painel SEM item ativo — o menu mobile já destacava
// a rota atual desde a Fase 26. A regra de "ativo" e as classes abaixo são
// as MESMAS do AdminMobileNav, agora com o ícone acompanhando o destaque.
//
// O que NÃO mudou: a lista continua vindo pronta do servidor, já filtrada
// por papel (NAV_LINKS) e com `liberado` resolvido por módulo. Este
// componente não decide visibilidade nem autorização — só desenha.
export function itemAtivo(pathname: string, href: string): boolean {
  // "/app" casa exato: startsWith pegaria todas as rotas do painel e
  // deixaria o Dashboard aceso em qualquer tela.
  if (href === "/app") return pathname === "/app";
  // Só casa em fronteira de segmento — sem isto, "/app/imoveis" acenderia
  // junto de uma futura "/app/imoveis-arquivados".
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminSidebarNav({ itens }: { itens: ItemNavAdmin[] }) {
  const pathname = usePathname();

  return (
    <nav className="flex-1 space-y-1 px-2 py-4 text-sm" aria-label="Navegação principal">
      {itens.map((item) => {
        const Icone = ICONES_NAV[item.icone];

        if (!item.liberado) {
          return (
            <span
              key={item.href}
              title="Disponível em planos superiores"
              className="flex cursor-not-allowed items-center gap-2.5 rounded-md px-3 py-2 text-gray-400"
            >
              <Icone aria-hidden className="size-[18px] shrink-0" />
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              <Badge variant="secondary" className="text-[10px]">
                Pro
              </Badge>
            </span>
          );
        }

        const ativo = itemAtivo(pathname, item.href);

        return (
          <Link
            key={item.href}
            href={item.href}
            // aria-current é o que comunica "você está aqui" a leitor de
            // tela: o fundo e o peso da fonte abaixo não chegam lá.
            aria-current={ativo ? "page" : undefined}
            className={
              ativo
                ? // Peso da fonte + cor + fundo juntos: a cor não é o
                  // único sinal do item atual.
                  "flex items-center gap-2.5 rounded-md bg-primary/10 px-3 py-2 font-medium text-primary outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                : "flex items-center gap-2.5 rounded-md px-3 py-2 text-gray-700 outline-none hover:bg-gray-100 hover:text-gray-900 focus-visible:ring-3 focus-visible:ring-ring/50"
            }
          >
            {/* O ícone herda a cor do texto (sem `text-*` próprio) — é o
                que o mantém como apoio do rótulo em vez de concorrer com
                ele, inclusive no estado ativo. */}
            <Icone aria-hidden className="size-[18px] shrink-0" />
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

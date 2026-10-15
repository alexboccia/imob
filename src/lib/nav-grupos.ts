import type { ChaveIconeNav } from "@/components/admin/icones-nav";

// Reorganização do menu lateral — item de navegação já resolvido pelo
// servidor (papel e módulo já aplicados em src/app/app/layout.tsx).
// `grupo` é o título exibido na categoria recolhível; ausente (Dashboard,
// único caso) renderiza como item solto no topo, fora de qualquer grupo.
export type ItemNavAdmin = {
  href: string;
  label: string;
  liberado: boolean;
  icone: ChaveIconeNav;
  grupo?: string;
};

export type GrupoNav = {
  titulo: string;
  itens: ItemNavAdmin[];
};

// Fase 62 — regra de "rota ativa" única para sidebar e menu mobile.
export function itemAtivo(pathname: string, href: string): boolean {
  // "/app" casa exato: startsWith pegaria todas as rotas do painel e
  // deixaria o Dashboard aceso em qualquer tela.
  if (href === "/app") return pathname === "/app";
  // Só casa em fronteira de segmento — sem isto, "/app/imoveis" acenderia
  // junto de uma futura "/app/imoveis-arquivados".
  return pathname === href || pathname.startsWith(`${href}/`);
}

// Centraliza o agrupamento para sidebar desktop e menu mobile nunca
// divergirem (mesma lista de entrada, mesma função pura) — nenhuma das
// duas decide sozinha onde um grupo começa ou termina.
//
// Itens SEM `grupo` (hoje, só o Dashboard) saem à parte, antes dos
// grupos — são o "fixo no topo" pedido, nunca uma categoria recolhível.
// A ordem dos grupos é a ordem de PRIMEIRA aparição de cada título na
// lista de entrada — por isso a ordem em TODOS_NAV_LINKS (layout.tsx) É
// a ordem final exibida, não um detalhe de implementação.
export function agruparItensNav(itens: ItemNavAdmin[]): {
  semGrupo: ItemNavAdmin[];
  grupos: GrupoNav[];
} {
  const semGrupo: ItemNavAdmin[] = [];
  const grupos: GrupoNav[] = [];
  const indicePorTitulo = new Map<string, number>();

  for (const item of itens) {
    if (!item.grupo) {
      semGrupo.push(item);
      continue;
    }
    const indiceExistente = indicePorTitulo.get(item.grupo);
    if (indiceExistente !== undefined) {
      grupos[indiceExistente].itens.push(item);
    } else {
      indicePorTitulo.set(item.grupo, grupos.length);
      grupos.push({ titulo: item.grupo, itens: [item] });
    }
  }

  return { semGrupo, grupos };
}

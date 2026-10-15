"use client";

import { usePathname } from "next/navigation";
import { agruparItensNav, type ItemNavAdmin } from "@/lib/nav-grupos";
import { ItemNavLinkAdmin, GrupoNavAdmin } from "@/components/admin/GrupoNavAdmin";

// Navegação da sidebar desktop (Fase 62; reorganizada em grupos
// recolhíveis na reorganização do menu lateral).
//
// A lista continua vindo pronta do servidor (NAV_LINKS em
// src/app/app/layout.tsx), já filtrada por papel e com `liberado`
// resolvido por módulo. Este componente não decide visibilidade nem
// autorização — só agrupa e desenha.
export function AdminSidebarNav({ itens }: { itens: ItemNavAdmin[] }) {
  const pathname = usePathname();
  const { semGrupo, grupos } = agruparItensNav(itens);

  return (
    // space-y-4 (16px): espaçamento ENTRE grupos (e entre Dashboard e o
    // primeiro grupo) — o espaçamento DENTRO de um grupo continua o
    // space-y-1 do próprio GrupoNavAdmin, inalterado.
    <nav className="flex-1 space-y-4 px-2 py-4 text-sm" aria-label="Navegação principal">
      {semGrupo.map((item) => (
        <ItemNavLinkAdmin key={item.href} item={item} pathname={pathname} />
      ))}
      {grupos.map((grupo) => (
        <GrupoNavAdmin key={grupo.titulo} titulo={grupo.titulo} itens={grupo.itens} pathname={pathname} />
      ))}
    </nav>
  );
}

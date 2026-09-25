"use client";

import type { ReactNode } from "react";
import { Handshake, LayoutDashboard, Megaphone, Wallet } from "lucide-react";
import { AbasConfiguracoes } from "@/components/admin/AbasConfiguracoes";

// Fronteira de cliente das abas do Analytics (Fase 68).
//
// POR QUE ESTE ARQUIVO EXISTE, e não os ícones direto na página: a página
// do Analytics é um Server Component, e um ícone da lucide é uma FUNÇÃO —
// funções não atravessam a fronteira servidor → cliente ("Functions cannot
// be passed directly to Client Components"). Foi exatamente o erro que
// apareceu ao passar LayoutDashboard/Megaphone/Handshake/Wallet para
// AbasConfiguracoes, que é cliente.
//
// A mesma restrição já tinha sido resolvida na sidebar (Fase 62) com um
// mapa de chaves de string. Aqui a solução é mais simples e mais local:
// os ícones são importados DENTRO do cliente, e a página passa apenas os
// painéis — elementos React, que atravessam a fronteira sem problema.
//
// AbasConfiguracoes fica intocado: ele continua recebendo LucideIcon, o
// que é legítimo para Configurações, cujo formulário já é cliente.
export function AbasAnalytics({
  geral,
  aquisicao,
  comercial,
  comissoes,
}: {
  geral: ReactNode;
  aquisicao: ReactNode;
  comercial: ReactNode;
  comissoes: ReactNode;
}) {
  return (
    <AbasConfiguracoes
      abas={[
        { id: "geral", rotulo: "Visão geral", icone: LayoutDashboard, conteudo: geral },
        { id: "aquisicao", rotulo: "Aquisição", icone: Megaphone, conteudo: aquisicao },
        { id: "comercial", rotulo: "Comercial", icone: Handshake, conteudo: comercial },
        { id: "comissoes", rotulo: "Comissões", icone: Wallet, conteudo: comissoes },
      ]}
    />
  );
}

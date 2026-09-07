import { cache } from "react";
import { prisma } from "@/lib/prisma";
import type { CommercialVisibility } from "@/generated/prisma/client";

// Leitura da política de visibilidade comercial (Fase 22).
//
// -----------------------------------------------------------------------
// POR QUE `cache()` DO REACT, E NÃO `unstable_cache`
// -----------------------------------------------------------------------
// A primeira versão usou `unstable_cache` com tag, copiando o padrão do
// fuso horário (Fase 18). ESTAVA ERRADO, e o E2E provou: a Organização G
// estava RESTRICTED no banco e a tela continuava mostrando a carteira
// inteira, porque uma entrada antiga do cache persistente continuava
// respondendo COLLABORATIVE. Sem `updateTag`, ela nunca expirava.
//
// Para o fuso, um cache velho atrasa a mudança de um rótulo. Aqui ele
// CONCEDE ACESSO que a organização já revogou — falha ABERTA, que é
// exatamente o que uma fronteira de autorização não pode ter.
//
// `cache()` do React é por REQUEST: várias páginas e actions do mesmo
// render compartilham uma consulta, e nenhuma requisição herda a decisão
// de outra. É o mesmo mecanismo que src/lib/tenant.ts já usa para checar
// se a organização está ativa — precedente do projeto para dado sensível
// a autorização. O custo é um lookup por chave primária por request.
//
// FALHA FECHADA: organização inexistente devolve RESTRICTED, o modo mais
// restritivo. O erro seguro aqui é conceder MENOS acesso, nunca mais.
export const VISIBILIDADE_PADRAO: CommercialVisibility = "COLLABORATIVE";

export const buscarVisibilidadeComercial = cache(
  async (organizationId: string): Promise<CommercialVisibility> => {
    const organizacao = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { commercialVisibility: true },
    });
    return organizacao?.commercialVisibility ?? "RESTRICTED";
  }
);

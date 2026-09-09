import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import type { MaterialListado } from "@/lib/materiais-imovel";

// Materiais ativos de um imóvel, para a ficha pública.
//
// Consulta PRÓPRIA, e não um `include` na consulta do imóvel, por um
// motivo operacional documentado: neste projeto as migrations NÃO são
// aplicadas automaticamente no deploy (ver
// docs/operations/deployment-runbook.md, seção 3 — dois incidentes reais
// de HTTP 500 em `/`, `/imoveis` e `/contato` por exatamente isso).
// Dentro do `include`, uma tabela ainda não migrada derruba a ficha
// INTEIRA: preço, descrição, contato, mapa. Isolada, o pior caso vira "o
// bloco novo não aparece", com o erro gritando no Sentry.
//
// O custo é nenhum: o Prisma já emite uma consulta separada para carregar
// relação em `include` — a diferença aqui é só quem trata o erro.
//
// P2021 é "a tabela não existe" e SÓ ele é engolido. Qualquer outro erro
// sobe: um problema real de banco não pode virar silêncio.
export async function buscarMateriaisAtivos(
  propertyId: string,
  organizationId: string
): Promise<MaterialListado[]> {
  try {
    return await prisma.propertyPresentationMaterial.findMany({
      where: { propertyId, organizationId, active: true },
      orderBy: { sortOrder: "asc" },
      // Sem a `url`: o arquivo não pode chegar ao HTML público antes da
      // captação do lead.
      select: { id: true, name: true },
    });
  } catch (erro) {
    if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === "P2021") {
      logger.error(
        "Tabela de materiais de apresentação ausente — migration pendente em produção",
        erro,
        { organizationId, modulo: "materiais" }
      );
      return [];
    }
    throw erro;
  }
}

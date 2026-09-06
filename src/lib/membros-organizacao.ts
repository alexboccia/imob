import { prisma } from "@/lib/prisma";
import { withOrganization } from "@/lib/tenant-context";
import { ordenarOpcoesResponsavel, type OpcaoResponsavel } from "@/lib/responsavel-negociacao";

// Fase 11 — membros da organização que podem RECEBER uma negociação.
//
// Uma query só, para a tela inteira: o seletor de responsável aparece no
// formulário de relacionar imóvel, no diálogo de transferência de cada
// card e no filtro do Kanban, e todos consomem esta mesma lista já
// carregada pelo Server Component. Nunca uma query por card (zero N+1).
//
// Só ACTIVE: INVITED ainda não aceitou o convite e SUSPENDED está
// desativado — nenhum dos dois recebe atribuição nova. Isso NÃO apaga o
// responsável histórico de negociações antigas, que continua sendo
// exibido com nome e marca de inativo (ver paraResponsavel).
export async function buscarMembrosAtribuiveis(
  organizationId: string
): Promise<OpcaoResponsavel[]> {
  return withOrganization(organizationId, async () => {
    const membros = await prisma.organizationMember.findMany({
      where: { organizationId, status: "ACTIVE" },
      select: { id: true, status: true, user: { select: { name: true } } },
    });
    return ordenarOpcoesResponsavel(membros);
  });
}

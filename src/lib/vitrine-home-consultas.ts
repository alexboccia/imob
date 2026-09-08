import { prisma } from "@/lib/prisma";
import { withOrganization } from "@/lib/tenant-context";
import {
  MAX_DESTAQUES_HOME,
  POSICOES_DESTAQUE,
  type OcupacaoVitrine,
} from "@/lib/vitrine-home";

// ELEGIBILIDADE PÚBLICA — a mesma regra que o resto do site já usa para
// decidir o que aparece: status AVAILABLE.
//
// Estar selecionado e estar elegível são coisas SEPARADAS de propósito.
// Um imóvel vendido continua guardando a posição que a imobiliária lhe
// deu: ele some da vitrine enquanto não estiver disponível e volta se
// voltar a estar, sem ninguém reconfigurar nada.
const ELEGIVEL_PUBLICAMENTE = { status: "AVAILABLE" } as const;

// =======================================================================
// Vitrine editorial da Home — CONSULTAS
// =======================================================================
// Separado de vitrine-home.ts porque aquele módulo é importado pelo
// formulário de imóvel (Client Component) e não pode arrastar Prisma
// para o bundle do navegador.

export type ImovelDaVitrine = {
  id: string;
  posicao: number;
};

// Consulta da HOME PÚBLICA. Filtra por tenant, seleção e elegibilidade,
// ordena explicitamente pela posição e limita no BANCO — nunca busca
// tudo para cortar no JavaScript.
export async function buscarDestaquesDaHome<T>(
  organizationId: string,
  select: T
) {
  return prisma.property.findMany({
    where: {
      organizationId,
      homeHighlightPosition: { not: null },
      ...ELEGIVEL_PUBLICAMENTE,
    },
    orderBy: { homeHighlightPosition: "asc" },
    take: MAX_DESTAQUES_HOME,
    select: select as never,
  });
}


// Quem ocupa cada posição hoje. Serve à tela de edição: escolher uma
// posição já ocupada precisa dizer POR QUEM, para que ninguém troque a
// vitrine sem perceber que derrubou outro imóvel.
//
// Aqui NÃO se filtra por elegibilidade: a ocupação é da seleção, e um
// imóvel vendido continua ocupando o slot que lhe deram.
export async function buscarOcupacaoVitrine(
  organizationId: string
): Promise<OcupacaoVitrine[]> {
  return withOrganization(organizationId, async () => {
    const selecionados = await prisma.property.findMany({
      where: { organizationId, homeHighlightPosition: { not: null } },
      orderBy: { homeHighlightPosition: "asc" },
      select: { id: true, title: true, homeHighlightPosition: true },
    });

    return POSICOES_DESTAQUE.map((posicao) => {
      const ocupante = selecionados.find((p) => p.homeHighlightPosition === posicao);
      return {
        posicao,
        imovel: ocupante ? { id: ocupante.id, title: ocupante.title } : null,
      };
    });
  });
}

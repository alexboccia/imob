import { prisma } from "@/lib/prisma";
import { withOrganization } from "@/lib/tenant-context";
import { hasModule } from "@/lib/entitlements";
import { normalizarBusca } from "@/lib/pagination";
import { construirWhereClientes, construirWhereImoveis } from "@/lib/listagens-admin-query";
import { wherePessoa } from "@/lib/escopo-comercial";
import { escopoComercialDaSessao } from "@/lib/escopo-comercial-sessao";
import { decimalParaValor } from "@/lib/valor-fechamento";
import {
  LIMITE_POR_CATEGORIA,
  MINIMO_CARACTERES_BUSCA,
  type ClienteBuscaGlobal,
  type ImovelBuscaGlobal,
  type ResultadoBuscaGlobal,
} from "@/lib/busca-global-tipos";

export {
  LIMITE_POR_CATEGORIA,
  MINIMO_CARACTERES_BUSCA,
  type ClienteBuscaGlobal,
  type ImovelBuscaGlobal,
  type ResultadoBuscaGlobal,
};

// =======================================================================
// Busca global (Fase 86)
// =======================================================================
// Investigação prévia (relatório da fase) encontrou duas listagens já
// maduras — construirWhereClientes/construirWhereImoveis
// (src/lib/listagens-admin-query.ts), já testadas, já usadas por
// /app/clientes e /app/imoveis — e decidiu REUTILIZAR essas mesmas
// funções aqui, nunca reimplementar a regra de segurança/normalização
// numa segunda query paralela.
//
// Empreendimento e PropertyInterest (negociação) ficaram FORA da V1:
// Empreendimento não tem ficha própria (/app/empreendimentos não tem
// rota [id], só uma lista plana — abrir um "resultado" não levaria a
// lugar nenhum além da mesma lista já visível), e PropertyInterest não
// tem identidade humana nem rota própria (/app/pipeline é um board, não
// há /app/pipeline/[id] — mesmo achado, reconfirmado, das Fases 81/84).
// Usuários ficou de fora por ser uma superfície de gestão interna, não a
// jornada "encontrar um cliente/imóvel que eu já conheço" que esta fase
// investigou.

const RESULTADO_VAZIO = (termo: string): ResultadoBuscaGlobal => ({
  termo,
  clientes: [],
  imoveis: [],
  crmHabilitado: false,
});

// Uma chamada por tecla (debounced no cliente) — duas queries pequenas e
// indexáveis (contains sobre colunas curtas, take:5), nunca uma varredura
// pra cortar no client depois. organizationId sempre explícito no
// where, nunca confiado só ao contexto do Prisma Client Extension
// (withOrganization) — mesmo padrão de defesa em profundidade do resto
// do produto.
export async function buscarGlobal(
  organizationId: string,
  termoBruto: string
): Promise<ResultadoBuscaGlobal> {
  const termo = normalizarBusca(termoBruto);
  if (termo.length < MINIMO_CARACTERES_BUSCA) return RESULTADO_VAZIO(termo);

  return withOrganization(organizationId, async () => {
    const [temCrm, escopo] = await Promise.all([
      hasModule(organizationId, "crm"),
      escopoComercialDaSessao(organizationId),
    ]);

    const [clientes, imoveis] = await Promise.all([
      // Sem o módulo CRM, /app/clientes está bloqueado inteiro — a busca
      // global não pode virar uma porta lateral pra um dado que o resto
      // do produto já esconde.
      temCrm
        ? prisma.person.findMany({
            where: construirWhereClientes({
              organizationId,
              busca: termo,
              escopo: wherePessoa(escopo),
            }),
            orderBy: { name: "asc" },
            take: LIMITE_POR_CATEGORIA,
            select: { id: true, name: true, phone: true, email: true },
          })
        : Promise.resolve([]),
      prisma.property.findMany({
        where: construirWhereImoveis({ organizationId, busca: termo }),
        orderBy: { title: "asc" },
        take: LIMITE_POR_CATEGORIA,
        select: {
          id: true,
          title: true,
          code: true,
          city: true,
          purpose: true,
          status: true,
          price: true,
          rentPrice: true,
        },
      }),
    ]);

    return {
      termo,
      clientes,
      imoveis: imoveis.map((i) => ({
        ...i,
        price: decimalParaValor(i.price),
        rentPrice: decimalParaValor(i.rentPrice),
      })),
      crmHabilitado: temCrm,
    };
  });
}

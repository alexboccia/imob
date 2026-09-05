import { prisma } from "@/lib/prisma";
import { withOrganization } from "@/lib/tenant-context";
import {
  tipoEventoValido,
  placementValido,
  visitorIdValido,
  calcularVisitorHash,
  JANELA_DEDUP_MS,
  TIPOS_EVENTO_ANALYTICS,
  type TipoEventoAnalytics,
  type PlacementAnalytics,
} from "@/lib/analytics-eventos";

// =======================================================================
// Registro de evento digital (Fase 6) — TODA a validação mora aqui.
// =======================================================================
// O browser não é fonte confiável de nada. Este módulo é a fronteira: o
// route handler só transporta o payload cru até aqui e devolve a
// resposta. Nada é gravado antes de:
//
//   1. o tipo de evento existir no catálogo;
//   2. o placement existir no catálogo (e só onde faz sentido);
//   3. o visitorId ter o formato que a própria aplicação emite;
//   4. a ORGANIZAÇÃO ser resolvida pelo slug NO SERVIDOR e estar ativa;
//   5. o IMÓVEL existir DENTRO dessa organização;
//   6. a deduplicação não encontrar evento equivalente recente.
//
// O passo 5 é a fronteira de tenant: um propertyId de outra organização
// não grava nada — nunca produziria um evento com organizationId de um
// tenant e propertyId de outro. Mesmo padrão defensivo já usado em
// enviarContato (src/app/[orgSlug]/actions.ts).
//
// `organizationId` NUNCA vem do navegador. O que vem é o orgSlug (dado
// público, presente na própria URL), e ele é sempre re-resolvido aqui.
// =======================================================================

export type ResultadoRegistro =
  | { resultado: "REGISTRADO" }
  // Evento válido que já estava contado na janela — não é erro, é a
  // deduplicação funcionando. O cliente recebe 202 igual.
  | { resultado: "DEDUPLICADO" }
  // Payload inválido/imóvel inexistente/tenant inativo. O cliente
  // recebe a MESMA resposta genérica: um endpoint público de tracking
  // não deve virar oráculo de "este imóvel existe nesta organização?".
  | { resultado: "IGNORADO"; motivo: string };

export type EntradaEvento = {
  organizationId: string;
  propertyId: unknown;
  type: unknown;
  placement?: unknown;
  visitorId: unknown;
  agora?: Date;
};

// Placement só existe para WHATSAPP_CLICK. Mandar placement num
// PROPERTY_VIEW não invalida o evento (seria hostil descartar uma
// visualização real por causa de um campo decorativo) — o campo é
// simplesmente ignorado, mantendo a coluna limpa para consulta.
export function normalizarPlacement(
  type: TipoEventoAnalytics,
  placement: unknown
): PlacementAnalytics | null {
  if (type !== TIPOS_EVENTO_ANALYTICS.WHATSAPP_CLICK) return null;
  return placementValido(placement) ? placement : null;
}

export async function registrarEventoAnalytics(
  entrada: EntradaEvento
): Promise<ResultadoRegistro> {
  const { organizationId } = entrada;
  const agora = entrada.agora ?? new Date();

  if (!tipoEventoValido(entrada.type)) {
    return { resultado: "IGNORADO", motivo: "tipo_invalido" };
  }
  if (!visitorIdValido(entrada.visitorId)) {
    return { resultado: "IGNORADO", motivo: "visitor_invalido" };
  }
  if (typeof entrada.propertyId !== "string" || entrada.propertyId.length === 0) {
    return { resultado: "IGNORADO", motivo: "imovel_invalido" };
  }

  const type = entrada.type;
  const propertyIdBruto = entrada.propertyId;
  const placement = normalizarPlacement(type, entrada.placement);

  return withOrganization(organizationId, async () => {
    // Fronteira de tenant: o imóvel precisa existir NESTA organização.
    // `select: { id }` — nunca carrega a linha inteira só pra validar.
    const imovel = await prisma.property.findUnique({
      where: { id: propertyIdBruto, organizationId },
      select: { id: true },
    });
    if (!imovel) return { resultado: "IGNORADO", motivo: "imovel_invalido" } as const;

    const visitorHash = calcularVisitorHash(entrada.visitorId as string, organizationId, imovel.id);
    const corte = new Date(agora.getTime() - JANELA_DEDUP_MS);

    // Deduplicação: mesmo visitante + mesmo imóvel + mesmo tipo dentro da
    // janela = um evento só. Serve o índice
    // (organizationId, propertyId, type, visitorHash, occurredAt).
    //
    // Não é uma unique constraint porque a chave envolve uma JANELA
    // MÓVEL, que nenhum índice único expressa: o mesmo par pode
    // legitimamente gerar um evento novo 31 minutos depois.
    //
    // Corrida possível (dois cliques simultâneos passando os dois pelo
    // findFirst antes de qualquer insert) resultaria numa visualização a
    // mais. Consciente e aceito: é telemetria agregada, não contabilidade
    // — e o custo de blindar isso (lock/constraint artificial) seria
    // desproporcional ao erro de ±1 num total.
    const jaExiste = await prisma.propertyAnalyticsEvent.findFirst({
      where: {
        organizationId,
        propertyId: imovel.id,
        type,
        visitorHash,
        occurredAt: { gte: corte },
      },
      select: { id: true },
    });
    if (jaExiste) return { resultado: "DEDUPLICADO" } as const;

    await prisma.propertyAnalyticsEvent.create({
      data: {
        organizationId,
        propertyId: imovel.id,
        type,
        placement,
        visitorHash,
        occurredAt: agora,
      },
    });

    return { resultado: "REGISTRADO" } as const;
  });
}

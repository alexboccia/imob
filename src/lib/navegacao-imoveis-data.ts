import { prisma } from "@/lib/prisma";
import { consultasVizinhos, type PosicaoNaOrdem } from "@/lib/navegacao-imoveis";

/**
 * Ids do imóvel anterior e do próximo na ordem pública padrão (Fase 48).
 * Duas consultas de uma linha cada, escopadas na organização — nunca a
 * listagem inteira. null quando não há vizinho (primeiro/último).
 */
export async function buscarVizinhosPublicos(
  organizationId: string,
  posicao: PosicaoNaOrdem
): Promise<{ anteriorId: string | null; proximoId: string | null }> {
  const consultas = consultasVizinhos(organizationId, posicao);
  const [anterior, proximo] = await Promise.all([
    prisma.property.findFirst({ ...consultas.anterior, select: { id: true } }),
    prisma.property.findFirst({ ...consultas.proximo, select: { id: true } }),
  ]);
  return { anteriorId: anterior?.id ?? null, proximoId: proximo?.id ?? null };
}

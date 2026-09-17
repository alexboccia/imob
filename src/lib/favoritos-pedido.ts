import { z } from "zod";
import { LIMITE_FAVORITOS, idImovelValido } from "@/lib/favoritos";

// Corpo aceito por POST /api/imoveis/favoritos (Fase 49). Estrito de
// propósito: é entrada do navegador, e o endpoint só existe para
// resolver a lista de favoritos — não é uma consulta genérica por ids.

const esquema = z
  .object({
    orgSlug: z.string().min(1).max(100),
    ids: z.array(z.string().refine(idImovelValido)).max(LIMITE_FAVORITOS),
  })
  .strict();

export type PedidoFavoritos = { orgSlug: string; ids: string[] };

/** null quando o corpo não é um pedido válido. Ids repetidos saem. */
export function interpretarPedidoFavoritos(corpo: unknown): PedidoFavoritos | null {
  const resultado = esquema.safeParse(corpo);
  if (!resultado.success) return null;
  return { orgSlug: resultado.data.orgSlug, ids: [...new Set(resultado.data.ids)] };
}

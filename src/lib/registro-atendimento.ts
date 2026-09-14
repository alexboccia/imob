import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";

// =======================================================================
// Registro de atendimento — a regra, num lugar só
// =======================================================================
// A ficha do cliente já registrava atendimento; a Central passou a
// registrar também, sem sair da tela. Duas ENTRADAS, uma REGRA: o que
// vale para uma vale para a outra, e o que é corrigido num lugar é
// corrigido nos dois.
//
// O que mora aqui é exatamente a parte que não pode divergir e que é
// PURA: o vocabulário de tipos, a validação do formulário e a montagem
// dos dados. Nada de Prisma em runtime — este módulo é importado pelo
// componente cliente do diálogo, e um import de `@/lib/prisma` aqui
// arrastaria o driver `pg` inteiro para o bundle do navegador (o build
// reprova, e com razão). A resolução do AUTOR, que precisa consultar o
// banco, vive ao lado das actions que a usam.

/**
 * Tipos de atendimento. É o enum `InteractionType` do schema, exposto
 * pelos rótulos que o corretor já lê no resto do CRM
 * (TIPO_INTERACAO_LABEL) — nenhum valor novo, nenhum enum cru na tela.
 */
export const TIPOS_ATENDIMENTO = ["VISIT", "CALL", "MESSAGE", "EMAIL", "OTHER"] as const;

/**
 * O que a Central sugere quando o corretor abre o formulário a partir de
 * um contato novo. LIGAÇÃO, e não visita: responder a alguém que acabou
 * de escrever é telefonar ou mandar mensagem — visita é o passo
 * seguinte, e já tem agendamento próprio. A ficha do cliente continua
 * sugerindo VISIT, que é o registro mais comum lá.
 */
export const TIPO_ATENDIMENTO_PADRAO = "CALL";

export const interacaoSchema = z.object({
  tipo: z.enum(TIPOS_ATENDIMENTO),
  notas: z.string().optional(),
});

/**
 * Os dados de uma Interaction de atendimento, prontos para o `create`.
 *
 * `personId` e `propertyId` NUNCA vêm do formulário: quem chama já os
 * leu de um registro validado contra a organização. É o que torna
 * impossível registrar atendimento sobre a pessoa ou o imóvel de outro
 * tenant mandando um id no FormData.
 */
export function dadosDoAtendimento(entrada: {
  organizationId: string;
  personId: string;
  propertyId: string | null;
  tipo: (typeof TIPOS_ATENDIMENTO)[number];
  notas: string | undefined;
  autorMemberId: string | null;
}): Prisma.InteractionUncheckedCreateInput {
  return {
    organizationId: entrada.organizationId,
    personId: entrada.personId,
    // Preservado do contato que originou o atendimento quando existe:
    // responder sobre um imóvel é um fato sobre aquele imóvel, e o
    // corretor não deveria ter de reinformar o que o sistema já sabe.
    propertyId: entrada.propertyId ?? undefined,
    type: entrada.tipo,
    notes: entrada.notas?.trim() || null,
    memberId: entrada.autorMemberId,
    // occurredAt fica no default do banco (agora). Registrar atendimento
    // é registrar o que acabou de acontecer; data retroativa seria outro
    // fluxo, com outra tela e outras perguntas.
  };
}

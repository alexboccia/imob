import { z } from "zod";

// =======================================================================
// Empreendimento (Fase 38)
// =======================================================================
// A identidade estrutural que permite afirmar "estas unidades são do
// mesmo empreendimento". Antes disso o produto só tinha semelhança —
// mesmo endereço, mesma construtora, mesmo bairro — e semelhança não é
// pertencimento.
//
// O QUE ESTE MÓDULO É: as regras puras do nome e nada mais. Consulta
// mora em empreendimento-consultas.ts (que importa Prisma e por isso
// nunca pode ser arrastado para o bundle do navegador — o seletor do
// formulário de imóvel é Client Component).
//
// POSSE vs IDENTIDADE: o Development não é dono de nada nesta fase.
// Endereço, construtora, fotos, materiais, obra, preço e finalidade
// continuam na Property. Agrupar não é herdar.
// =======================================================================

/** Teto do nome. Mesmo raciocínio dos catálogos irmãos: nome de vitrine
 *  administrativa, não texto longo. */
export const LIMITE_NOME_EMPREENDIMENTO = 120;

export const nomeEmpreendimentoSchema = z
  .string()
  .trim()
  .min(2, "Informe o nome do empreendimento.")
  .max(
    LIMITE_NOME_EMPREENDIMENTO,
    `O nome deve ter no máximo ${LIMITE_NOME_EMPREENDIMENTO} caracteres.`
  );

export const empreendimentoSchema = z.object({ nome: nomeEmpreendimentoSchema });

// -----------------------------------------------------------------------
// Vínculo da unidade
// -----------------------------------------------------------------------
// O formulário de imóvel manda o ID do empreendimento, nunca o nome: uma
// string livre seria identidade sem integridade, que é exatamente o que
// esta fase existe para não fazer.
//
// String vazia = "sem empreendimento", um estado legítimo e o de toda
// Property anterior a esta fase. Interpretado aqui, num lugar só, para
// que a action não precise repetir a distinção entre "não informado" e
// "desvincular".
export const SEM_EMPREENDIMENTO = "";

export function interpretarVinculoEmpreendimento(bruto: unknown): string | null {
  if (bruto === null || bruto === undefined) return null;
  const texto = String(bruto).trim();
  return texto === SEM_EMPREENDIMENTO ? null : texto;
}

// -----------------------------------------------------------------------
// Exibição
// -----------------------------------------------------------------------
export type OpcaoEmpreendimento = { id: string; nome: string };

/** Rótulo da opção vazia do seletor. Texto, nunca um traço: "sem
 *  empreendimento" é uma escolha declarada, não a ausência de escolha. */
export const ROTULO_SEM_EMPREENDIMENTO = "Sem empreendimento";

// Conjuntos de papéis autorizados por área sensível do painel. Centralizado
// aqui para que a regra de "quem pode fazer o quê" tenha um único lugar de
// verdade — evita checagens de papel divergentes espalhadas pelas actions.
export const PAPEIS_GESTAO_CONFIGURACOES: ReadonlySet<string> = new Set([
  "OWNER",
  "ADMIN",
]);

export const PAPEIS_GESTAO_CATALOGOS: ReadonlySet<string> = new Set([
  "OWNER",
  "ADMIN",
  "MANAGER",
]);

export const PAPEIS_GESTAO_USUARIOS: ReadonlySet<string> = new Set([
  "OWNER",
  "ADMIN",
]);

// Fase 13 — LIQUIDAÇÃO de comissão. Não é papel financeiro inventado: é
// a camada gerencial que este arquivo já define, aplicada a uma operação
// mais sensível que as demais do CRM. Registrar ou cancelar pagamento
// afirma que dinheiro mudou de mãos — mais grave que atribuir uma parcela
// (Fase 12), que segue no gate do CRM. A assimetria é deliberada e está
// documentada como dívida no relatório da fase.
export const PAPEIS_LIQUIDACAO_COMISSAO: ReadonlySet<string> = new Set([
  "OWNER",
  "ADMIN",
  "MANAGER",
]);

export function temPapel(
  role: string | undefined,
  permitidos: ReadonlySet<string>
): boolean {
  return !!role && permitidos.has(role);
}

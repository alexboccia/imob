import type { z } from "zod";

// Formato padrão de retorno das Server Actions que recebem dados de
// formulário. `message` é o erro/aviso geral; `fieldErrors` mapeia nome do
// campo (igual ao `name` do input) para as mensagens daquele campo.
export type ActionState = {
  success: boolean;
  message?: string;
  fieldErrors?: Record<string, string[]>;
};

export const ESTADO_INICIAL_ACAO: ActionState = { success: false };

export function erroValidacao(erro: z.ZodError): ActionState {
  return {
    success: false,
    message: "Verifique os campos destacados.",
    fieldErrors: erro.flatten().fieldErrors as Record<string, string[]>,
  };
}

export function erroAcessoNegado(
  mensagem = "Você não tem permissão para realizar esta ação."
): ActionState {
  return { success: false, message: mensagem };
}

export function erroGenerico(mensagem: string): ActionState {
  return { success: false, message: mensagem };
}

export function sucesso(mensagem?: string): ActionState {
  return { success: true, message: mensagem };
}

import { z } from "zod";
import {
  LIMITE_BIO_PUBLICA,
  LIMITE_CRECI,
  LIMITE_EMAIL_PUBLICO,
} from "@/lib/perfil-publico-limites";
import { normalizarTelefone, telefoneValido } from "@/lib/telefone";

// =======================================================================
// Perfil público — validação e mapeamento, um lugar só
// =======================================================================
// Duas telas escrevem estes mesmos campos: a de gestão de usuários
// (OWNER/ADMIN editando um membro) e a de autoatendimento (a pessoa
// editando o próprio perfil). O que elas NÃO podem ter é duas ideias
// diferentes do que é um CRECI aceitável ou de como um telefone é
// guardado — por isso o schema e o mapeamento vivem aqui, e cada action
// só decide QUEM pode escrever, nunca O QUE é válido.
//
// Este objeto é também a lista fechada do que o perfil público comporta:
// papel, status, e-mail de login e qualquer outro campo administrativo
// ficam de fora por construção, e não por lembrança de quem escreve a
// action. É o que impede mass assignment na tela de autoatendimento.

export const perfilPublicoSchema = z.object({
  perfilPublicoAtivo: z.preprocess((v) => v === "on", z.boolean()),
  perfilPublicoCreci: z
    .string()
    .max(LIMITE_CRECI, `Use no máximo ${LIMITE_CRECI} caracteres.`)
    .optional()
    .or(z.literal("")),
  perfilPublicoFoto: z.string().optional().or(z.literal("")),
  perfilPublicoBio: z
    .string()
    .max(LIMITE_BIO_PUBLICA, `Use no máximo ${LIMITE_BIO_PUBLICA} caracteres.`)
    .optional()
    .or(z.literal("")),
  perfilPublicoWhatsapp: z.string().optional().or(z.literal("")),
  // Telefone brasileiro (10-11 dígitos, sem DDI), pelo mesmo utilitário
  // do CRM. Diferente do WhatsApp acima de propósito: aquele guarda DDI
  // porque wa.me exige.
  perfilPublicoTelefone: z
    .string()
    .refine((v) => v === "" || telefoneValido(v), "Telefone inválido.")
    .optional()
    .or(z.literal("")),
  perfilPublicoEmail: z
    .string()
    .max(LIMITE_EMAIL_PUBLICO, `Use no máximo ${LIMITE_EMAIL_PUBLICO} caracteres.`)
    .email("E-mail público inválido.")
    .optional()
    .or(z.literal("")),
});

export type DadosPerfilPublico = z.infer<typeof perfilPublicoSchema>;

/** "" e espaços viram null: campo em branco é ausência, não string vazia. */
function textoOuNulo(valor: string | undefined): string | null {
  return valor?.trim() || null;
}

/**
 * Traduz o formulário nas colunas do OrganizationMember.
 *
 * Devolve SÓ colunas public* — é isso que garante, nas duas actions, que
 * salvar um perfil não consegue tocar em papel, status ou vínculo.
 */
export function camposDoPerfilPublico(dados: DadosPerfilPublico) {
  return {
    publicProfileEnabled: dados.perfilPublicoAtivo,
    publicCreci: textoOuNulo(dados.perfilPublicoCreci),
    publicPhotoUrl: textoOuNulo(dados.perfilPublicoFoto),
    publicBio: textoOuNulo(dados.perfilPublicoBio),
    publicWhatsapp: dados.perfilPublicoWhatsapp
      ? dados.perfilPublicoWhatsapp.replace(/\D/g, "") || null
      : null,
    publicPhone: dados.perfilPublicoTelefone
      ? normalizarTelefone(dados.perfilPublicoTelefone)
      : null,
    // Trim apenas, sem baixar caixa: o produto guarda e-mail como
    // digitado (ver contactEmail). Minúsculas existem em
    // normalizarEmail, que é chave de deduplicação, não formato de
    // armazenamento.
    publicEmail: textoOuNulo(dados.perfilPublicoEmail),
  };
}

/** Os campos do formulário, lidos de um FormData. */
export function lerPerfilPublicoDoFormulario(formData: FormData) {
  return {
    perfilPublicoAtivo: formData.get("perfilPublicoAtivo"),
    perfilPublicoCreci: formData.get("perfilPublicoCreci") ?? "",
    perfilPublicoFoto: formData.get("perfilPublicoFoto") ?? "",
    perfilPublicoBio: formData.get("perfilPublicoBio") ?? "",
    perfilPublicoWhatsapp: formData.get("perfilPublicoWhatsapp") ?? "",
    perfilPublicoTelefone: formData.get("perfilPublicoTelefone") ?? "",
    perfilPublicoEmail: formData.get("perfilPublicoEmail") ?? "",
  };
}

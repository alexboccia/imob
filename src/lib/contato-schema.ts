import { z } from "zod";
import { telefoneValido } from "@/lib/telefone";

// Extraído de src/app/[orgSlug]/actions.ts: Server Actions ("use server") só
// podem exportar funções async, então esses schemas não podiam ser
// importados/testados diretamente de lá.

export const contatoSchema = z.object({
  nome: z.string().min(2),
  email: z.string().email().optional().or(z.literal("")),
  telefone: z
    .string()
    .refine((v) => telefoneValido(v), "Telefone inválido")
    .optional()
    .or(z.literal("")),
  mensagem: z.string().min(5),
  imovelId: z.string().optional(),
});

export const anuncieSchema = z.object({
  nome: z.string().min(2),
  email: z.string().email().optional().or(z.literal("")),
  telefone: z.string().refine((v) => telefoneValido(v), "Telefone inválido"),
  descricaoImovel: z.string().min(5),
});

// Pedido de materiais de apresentação de um imóvel.
//
// Duas diferenças deliberadas em relação a contatoSchema:
//
//  - não há campo de mensagem: quem pede o book não está escrevendo pra
//    ninguém, e um textarea obrigatório só reduziria a conversão;
//
//  - e-mail OU telefone é OBRIGATÓRIO (no formulário de contato os dois
//    são opcionais). Um pedido de material sem nenhuma forma de retorno
//    não é lead nenhum — é um download anônimo com um nome digitado do
//    lado. Exigir os dois seria atrito à toa; exigir pelo menos um é o
//    que torna o registro útil pro corretor.
export const materiaisSchema = z
  .object({
    nome: z.string().trim().min(2),
    email: z.string().trim().email().optional().or(z.literal("")),
    telefone: z
      .string()
      .refine((v) => v === "" || telefoneValido(v), "Telefone inválido")
      .optional()
      .or(z.literal("")),
    imovelId: z.string().min(1),
  })
  .refine((dados) => Boolean(dados.email) || Boolean(dados.telefone), {
    message: "Informe e-mail ou telefone.",
    path: ["email"],
  });

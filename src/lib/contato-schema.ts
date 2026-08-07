import { z } from "zod";
import { telefoneValido } from "@/lib/telefone";

// Extraído de src/app/(public)/actions.ts: Server Actions ("use server") só
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

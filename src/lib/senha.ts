import { z } from "zod";

// =======================================================================
// Política de senha (Fase 25)
// =======================================================================
// O mínimo de 6 caracteres é o que o produto JÁ exigia (convite do OWNER
// e criação de usuário). Não foi reduzido — reduzir seria enfraquecer
// contas existentes — e também não foi inflado com "1 maiúscula, 1
// símbolo, 1 número": regras de composição empurram as pessoas para
// senhas curtas e previsíveis ("Senha@1"), e as diretrizes atuais
// (NIST SP 800-63B) recomendam comprimento em vez de composição.
//
// O que MUDA aqui é o teto: sem máximo declarado, o bcrypt trunca
// silenciosamente em 72 bytes — uma senha longa de gerenciador teria
// caracteres ignorados sem ninguém saber. 72 é o limite real do
// algoritmo, então ele é dito em voz alta em vez de acontecer às
// escondidas.
export const SENHA_MINIMA = 6;
export const SENHA_MAXIMA = 72;

export const senhaSchema = z
  .string()
  .min(SENHA_MINIMA, `A senha precisa ter ao menos ${SENHA_MINIMA} caracteres.`)
  .max(SENHA_MAXIMA, `A senha pode ter no máximo ${SENHA_MAXIMA} caracteres.`);

// Custo do bcrypt, centralizado. É o valor que o projeto já usava em
// todos os pontos de hash — nomeá-lo evita que um call site novo
// divirja em silêncio, e torna uma futura elevação uma edição só.
export const CUSTO_BCRYPT = 10;

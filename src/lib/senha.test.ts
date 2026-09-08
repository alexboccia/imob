import { describe, test, expect } from "vitest";
import { senhaSchema, SENHA_MINIMA, SENHA_MAXIMA, CUSTO_BCRYPT } from "./senha";

describe("política de senha", () => {
  test("aceita o mínimo que o produto já exigia", () => {
    // 6 é o que convite e criação de usuário já pediam. Não foi reduzido
    // — reduzir enfraqueceria contas existentes.
    expect(SENHA_MINIMA).toBe(6);
    expect(senhaSchema.safeParse("abcdef").success).toBe(true);
  });

  test("recusa senha curta demais", () => {
    expect(senhaSchema.safeParse("abcde").success).toBe(false);
  });

  test("aceita frase longa de gerenciador de senhas", () => {
    expect(senhaSchema.safeParse("uma frase longa e facil de lembrar").success).toBe(true);
  });

  test("recusa acima de 72 bytes em vez de deixar o bcrypt truncar em silêncio", () => {
    // É o limite REAL do algoritmo. Sem o teto declarado, os caracteres
    // além de 72 seriam ignorados sem ninguém saber — e duas senhas
    // diferentes passariam a abrir a mesma conta.
    expect(SENHA_MAXIMA).toBe(72);
    expect(senhaSchema.safeParse("x".repeat(72)).success).toBe(true);
    expect(senhaSchema.safeParse("x".repeat(73)).success).toBe(false);
  });

  test("não exige composição (maiúscula, símbolo, número)", () => {
    // Regras de composição empurram para senhas curtas e previsíveis.
    expect(senhaSchema.safeParse("senhasimples").success).toBe(true);
  });

  test("o custo do bcrypt é o que o projeto já usava", () => {
    expect(CUSTO_BCRYPT).toBe(10);
  });
});

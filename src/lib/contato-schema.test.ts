import { describe, test, expect } from "vitest";
import { contatoSchema, anuncieSchema } from "@/lib/contato-schema";

describe("contatoSchema", () => {
  test("aceita dados mínimos válidos (sem e-mail/telefone, que são opcionais)", () => {
    const r = contatoSchema.safeParse({
      nome: "João Silva",
      email: "",
      telefone: "",
      mensagem: "Tenho interesse neste imóvel",
    });
    expect(r.success).toBe(true);
  });

  test("aceita com e-mail e telefone válidos", () => {
    const r = contatoSchema.safeParse({
      nome: "João Silva",
      email: "joao@example.com",
      telefone: "11999998888",
      mensagem: "Tenho interesse neste imóvel",
      imovelId: "prop-1",
    });
    expect(r.success).toBe(true);
  });

  test("recusa nome muito curto", () => {
    const r = contatoSchema.safeParse({
      nome: "J",
      email: "",
      telefone: "",
      mensagem: "Tenho interesse neste imóvel",
    });
    expect(r.success).toBe(false);
  });

  test("recusa e-mail com formato inválido", () => {
    const r = contatoSchema.safeParse({
      nome: "João Silva",
      email: "não-é-email",
      telefone: "",
      mensagem: "Tenho interesse neste imóvel",
    });
    expect(r.success).toBe(false);
  });

  test("recusa telefone com formato inválido quando informado", () => {
    const r = contatoSchema.safeParse({
      nome: "João Silva",
      email: "",
      telefone: "123",
      mensagem: "Tenho interesse neste imóvel",
    });
    expect(r.success).toBe(false);
  });

  test("recusa mensagem muito curta", () => {
    const r = contatoSchema.safeParse({
      nome: "João Silva",
      email: "",
      telefone: "",
      mensagem: "oi",
    });
    expect(r.success).toBe(false);
  });
});

describe("anuncieSchema", () => {
  test("aceita dados válidos (telefone é obrigatório aqui, ao contrário do contato)", () => {
    const r = anuncieSchema.safeParse({
      nome: "Maria Souza",
      email: "",
      telefone: "11999998888",
      descricaoImovel: "Apartamento de 2 quartos no centro",
    });
    expect(r.success).toBe(true);
  });

  test("recusa quando telefone está ausente", () => {
    const r = anuncieSchema.safeParse({
      nome: "Maria Souza",
      email: "",
      telefone: "",
      descricaoImovel: "Apartamento de 2 quartos no centro",
    });
    expect(r.success).toBe(false);
  });

  test("recusa descrição muito curta", () => {
    const r = anuncieSchema.safeParse({
      nome: "Maria Souza",
      email: "",
      telefone: "11999998888",
      descricaoImovel: "oi",
    });
    expect(r.success).toBe(false);
  });
});

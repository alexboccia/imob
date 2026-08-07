import { describe, test, expect } from "vitest";
import {
  temPapel,
  PAPEIS_GESTAO_CONFIGURACOES,
  PAPEIS_GESTAO_CATALOGOS,
  PAPEIS_GESTAO_USUARIOS,
} from "@/lib/authorization";

describe("temPapel", () => {
  test("papel presente no conjunto é autorizado", () => {
    expect(temPapel("OWNER", PAPEIS_GESTAO_CONFIGURACOES)).toBe(true);
    expect(temPapel("ADMIN", PAPEIS_GESTAO_CONFIGURACOES)).toBe(true);
  });

  test("papel ausente no conjunto não é autorizado", () => {
    expect(temPapel("BROKER", PAPEIS_GESTAO_CONFIGURACOES)).toBe(false);
    expect(temPapel("MANAGER", PAPEIS_GESTAO_CONFIGURACOES)).toBe(false);
  });

  test("papel undefined nunca é autorizado", () => {
    expect(temPapel(undefined, PAPEIS_GESTAO_CONFIGURACOES)).toBe(false);
  });

  test("string vazia nunca é autorizada", () => {
    expect(temPapel("", PAPEIS_GESTAO_USUARIOS)).toBe(false);
  });

  test("PAPEIS_GESTAO_CATALOGOS inclui MANAGER além de OWNER/ADMIN", () => {
    expect(temPapel("MANAGER", PAPEIS_GESTAO_CATALOGOS)).toBe(true);
    expect(temPapel("MANAGER", PAPEIS_GESTAO_USUARIOS)).toBe(false);
  });

  test("BROKER e ASSISTANT nunca gerenciam usuários", () => {
    expect(temPapel("BROKER", PAPEIS_GESTAO_USUARIOS)).toBe(false);
    expect(temPapel("ASSISTANT", PAPEIS_GESTAO_USUARIOS)).toBe(false);
  });
});

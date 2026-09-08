import { describe, test, expect } from "vitest";
import { authConfig } from "./auth.config";

// =======================================================================
// REGRESSÃO — o formato real de unstable_update (Fase 26)
// =======================================================================
// O bug: `unstable_update({ user: {...} })` entrega as claims DENTRO de
// `user`, e o callback lia a raiz. Nada lançava, nada logava — a troca
// de organização simplesmente não acontecia, e a tela voltava calada
// para o tenant anterior.
//
// Estes testes existem porque o defeito era invisível: só um teste que
// conheça a ESTRUTURA REAL do payload consegue prendê-lo.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const jwt = authConfig.callbacks.jwt as any;

describe("callback jwt — troca de organização", () => {
  test("aplica as claims que chegam dentro de `user`", async () => {
    const token = await jwt({
      token: { organizationId: "org-a", organizationMemberId: "membro-a", role: "OWNER" },
      trigger: "update",
      session: {
        user: {
          organizationId: "org-b",
          organizationMemberId: "membro-b",
          role: "BROKER",
        },
      },
    });

    expect(token.organizationId).toBe("org-b");
    expect(token.organizationMemberId).toBe("membro-b");
    expect(token.role).toBe("BROKER");
  });

  test("os três campos mudam JUNTOS — o papel de A nunca sobrevive em B", async () => {
    const token = await jwt({
      token: { organizationId: "org-a", organizationMemberId: "membro-a", role: "OWNER" },
      trigger: "update",
      session: {
        user: { organizationId: "org-b", organizationMemberId: "membro-b", role: "BROKER" },
      },
    });

    // Nenhum resquício do tenant anterior.
    expect(token.organizationId).not.toBe("org-a");
    expect(token.organizationMemberId).not.toBe("membro-a");
    expect(token.role).not.toBe("OWNER");
  });

  test("payload incompleto não atualiza NADA — nunca parcialmente", async () => {
    // Um update sem o papel deixaria a sessão apontando para B com o
    // papel de A: exatamente o vazamento que a fase proíbe.
    const original = {
      organizationId: "org-a",
      organizationMemberId: "membro-a",
      role: "OWNER",
    };
    const token = await jwt({
      token: { ...original },
      trigger: "update",
      session: { user: { organizationId: "org-b" } },
    });

    expect(token).toMatchObject(original);
  });

  test("claims na RAIZ (formato antigo, incorreto) são ignoradas", async () => {
    // É a assinatura exata do bug. Se alguém "simplificar" o callback de
    // volta para ler a raiz, este teste passa a falhar no outro sentido:
    // aqui o esperado é justamente NÃO aplicar.
    const token = await jwt({
      token: { organizationId: "org-a", organizationMemberId: "membro-a", role: "OWNER" },
      trigger: "update",
      session: { organizationId: "org-b", organizationMemberId: "membro-b", role: "BROKER" },
    });

    expect(token.organizationId).toBe("org-a");
  });

  test("sem trigger de update, a sessão não reescreve o token", async () => {
    const token = await jwt({
      token: { organizationId: "org-a", organizationMemberId: "membro-a", role: "OWNER" },
      session: { user: { organizationId: "org-b" } },
    });
    expect(token.organizationId).toBe("org-a");
  });

  test("no login, as claims vêm do user autenticado", async () => {
    const token = await jwt({
      token: {},
      user: { organizationId: "org-a", organizationMemberId: "membro-a", role: "OWNER" },
    });
    expect(token.organizationId).toBe("org-a");
    expect(token.role).toBe("OWNER");
  });
});

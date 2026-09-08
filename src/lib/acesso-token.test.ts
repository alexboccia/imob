import { describe, test, expect, vi, afterEach } from "vitest";
import { createHash } from "node:crypto";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import {
  gerarTokenAcesso,
  hashToken,
  expiracaoConvite,
  expiracaoReset,
  linkConvite,
  linkRedefinicao,
} from "./acesso-token";

// =======================================================================
// Segredos de acesso (Fase 25) — propriedades, não implementação
// =======================================================================

describe("geração de token", () => {
  test("é imprevisível: 500 tokens, nenhuma repetição", () => {
    const vistos = new Set<string>();
    for (let i = 0; i < 500; i++) vistos.add(gerarTokenAcesso());
    expect(vistos.size).toBe(500);
  });

  test("carrega 256 bits de entropia", () => {
    // base64url de 32 bytes: 43 caracteres (sem padding). O tamanho é a
    // evidência observável de que a fonte são 32 bytes de randomBytes, e
    // não um UUID (36 chars com hifens) nem um timestamp.
    const token = gerarTokenAcesso();
    expect(token).toHaveLength(43);
    // base64url: sem "+", "/" nem "=" — seguro dentro de uma URL, que é
    // exatamente onde ele vai viajar.
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

describe("hash do token", () => {
  test("é sha256 completo, determinístico", () => {
    const token = "token-de-teste";
    const esperado = createHash("sha256").update(token).digest("hex");
    expect(hashToken(token)).toBe(esperado);
    expect(hashToken(token)).toHaveLength(64);
  });

  test("tokens diferentes produzem hashes diferentes", () => {
    expect(hashToken("a")).not.toBe(hashToken("b"));
  });

  test("o hash não permite recuperar o token", () => {
    // Afirmação óbvia, mas é a que sustenta guardar só o hash: o valor
    // persistido não contém o segredo em lugar nenhum dele.
    const token = gerarTokenAcesso();
    expect(hashToken(token)).not.toContain(token);
  });
});

describe("expiração", () => {
  afterEach(() => vi.useRealTimers());

  test("convite vale 7 dias; recuperação vale 60 minutos", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-08T12:00:00.000Z"));

    expect(expiracaoConvite().toISOString()).toBe("2026-09-15T12:00:00.000Z");
    expect(expiracaoReset().toISOString()).toBe("2026-09-08T13:00:00.000Z");
  });

  test("a janela da recuperação é muito mais curta que a do convite", () => {
    // A relação entre as duas é a decisão de segurança, não os números
    // em si: o convite abre uma conta que ainda não existe, a
    // recuperação abre uma que já tem dados dentro.
    const agora = Date.now();
    expect(expiracaoReset().getTime() - agora).toBeLessThan(
      expiracaoConvite().getTime() - agora
    );
  });

  test("nenhum token é eterno", () => {
    const agora = Date.now();
    expect(expiracaoConvite().getTime()).toBeGreaterThan(agora);
    expect(expiracaoReset().getTime()).toBeGreaterThan(agora);
  });
});

describe("links de e-mail", () => {
  test("saem da configuração da aplicação, nunca do Host da requisição", () => {
    // NEXT_PUBLIC_SITE_URL é lido em tempo de chamada por getSiteUrl. O
    // teste prova a propriedade que fecha host-header poisoning: o link
    // depende SÓ de configuração, e nenhum cabeçalho entra nesta conta.
    const anterior = process.env.NEXT_PUBLIC_SITE_URL;
    process.env.NEXT_PUBLIC_SITE_URL = "https://painel.exemplo.test";
    try {
      expect(linkConvite("abc")).toBe("https://painel.exemplo.test/app/convite/abc");
      expect(linkRedefinicao("abc")).toBe(
        "https://painel.exemplo.test/app/redefinir-senha/abc"
      );
    } finally {
      process.env.NEXT_PUBLIC_SITE_URL = anterior;
    }
  });

  test("apontam para rotas internas do próprio produto", () => {
    // Nenhum dos dois aceita destino vindo de fora: o caminho é fixo no
    // código, então não há parâmetro de redirecionamento a envenenar.
    expect(linkConvite("t")).toContain("/app/convite/");
    expect(linkRedefinicao("t")).toContain("/app/redefinir-senha/");
  });
});

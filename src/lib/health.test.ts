import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";

// O limite correto de mock é a ABSTRAÇÃO do provider, não o cliente HTTP
// do Upstash: `checarUpstash` só conhece `obterKvStore()` e a interface
// KvStore, e é exatamente essa fronteira que os testes exercitam. Nenhum
// teste unitário faz chamada de rede real.
vi.mock("@/lib/kv-store", () => ({ obterKvStore: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { $queryRaw: vi.fn() } }));

import { obterKvStore, type KvStore } from "@/lib/kv-store";
import { prisma } from "@/lib/prisma";
import {
  checarUpstash,
  checarResendConfigurado,
  checarBancoDeDados,
  verificarSaudeCompleta,
} from "@/lib/health";

// Valores de mentira com a FORMA de um segredo real — é contra eles que
// os testes de vazamento abaixo procuram na resposta.
const URL_FALSA = "https://exemplo-falso-12345.upstash.io";
const TOKEN_FALSO = "AX4wASQgZmFrZS10b2tlbi1kZS10ZXN0ZQ";

function storeFake(obter: KvStore["obter"]): KvStore {
  return {
    obter,
    // As demais operações NUNCA devem ser chamadas pelo diagnóstico:
    // qualquer uma delas mexeria em contador real de rate limit.
    incrementarComJanela: vi.fn(async () => {
      throw new Error("o diagnóstico não pode incrementar balde");
    }),
    definir: vi.fn(async () => {
      throw new Error("o diagnóstico não pode escrever");
    }),
    remover: vi.fn(async () => {
      throw new Error("o diagnóstico não pode remover");
    }),
    ttl: vi.fn(async () => 0),
  };
}

beforeEach(() => {
  vi.mocked(obterKvStore).mockReset();
});

describe("checarUpstash — não configurado", () => {
  test("provider ausente devolve 'não configurado', nunca erro", async () => {
    vi.mocked(obterKvStore).mockReturnValue(null);
    const r = await checarUpstash();
    expect(r.ok).toBe(false);
    expect(r.motivo).toBe("não configurado");
    // Distinguir de falha é o ponto: ambiente de desenvolvimento sem
    // Upstash não pode parecer um provider quebrado.
    expect(r.motivo).not.toBe("falha de conexão");
    expect(r.latenciaMs).toBeUndefined();
  });
});

describe("checarUpstash — operacional", () => {
  test("ida e volta ao Redis devolve ok com latência", async () => {
    // Chave de diagnóstico não existe: `null` é a resposta ESPERADA e
    // já prova credencial aceita + serviço respondendo.
    vi.mocked(obterKvStore).mockReturnValue(storeFake(async () => null));
    const r = await checarUpstash();
    expect(r.ok).toBe(true);
    expect(r.motivo).toBeUndefined();
    expect(typeof r.latenciaMs).toBe("number");
  });

  test("lê uma chave de diagnóstico própria, fora do espaço dos baldes reais", async () => {
    const obter: KvStore["obter"] = vi.fn(async () => null);
    vi.mocked(obterKvStore).mockReturnValue(storeFake(obter));
    await checarUpstash();

    expect(obter).toHaveBeenCalledTimes(1);
    const chave = vi.mocked(obter).mock.calls[0]![0];
    // Nunca o prefixo dos baldes reais (login, formulários, upload,
    // analytics e os limites de visita da Fase 56 vivem todos em "rl:").
    expect(chave.startsWith("rl:")).toBe(false);
    expect(chave).toBe("diag:upstash:ping");
    // E nada de identidade de ninguém na chave.
    expect(chave).not.toMatch(/@|org|imovel|contato|login/i);
  });

  test("o diagnóstico é somente leitura: não escreve nem incrementa nada", async () => {
    const store = storeFake(async () => null);
    vi.mocked(obterKvStore).mockReturnValue(store);
    await checarUpstash();

    expect(store.incrementarComJanela).not.toHaveBeenCalled();
    expect(store.definir).not.toHaveBeenCalled();
    expect(store.remover).not.toHaveBeenCalled();
  });
});

describe("checarUpstash — configurado mas com erro", () => {
  test("provider indisponível devolve 'falha de conexão'", async () => {
    vi.mocked(obterKvStore).mockReturnValue(
      storeFake(async () => {
        throw new Error("fetch failed");
      })
    );
    const r = await checarUpstash();
    expect(r.ok).toBe(false);
    expect(r.motivo).toBe("falha de conexão");
    // "configurado mas quebrado" nunca pode virar "não configurado":
    // são dois problemas com correções diferentes.
    expect(r.motivo).not.toBe("não configurado");
  });

  test("credencial inválida também é erro, não 'não configurado'", async () => {
    vi.mocked(obterKvStore).mockReturnValue(
      storeFake(async () => {
        throw new Error("WRONGPASS invalid or missing auth token");
      })
    );
    const r = await checarUpstash();
    expect(r.ok).toBe(false);
    expect(r.motivo).toBe("falha de conexão");
  });

  test("provider pendurado estoura no timeout do diagnóstico, sem prender a rota", async () => {
    vi.mocked(obterKvStore).mockReturnValue(
      storeFake(() => new Promise(() => {}))
    );
    const inicio = Date.now();
    const r = await checarUpstash(50);
    expect(r.ok).toBe(false);
    expect(r.motivo).toBe("timeout");
    expect(Date.now() - inicio).toBeLessThan(2000);
  });
});

describe("checarUpstash — a resposta nunca vaza credencial", () => {
  // Cada cenário de erro devolve uma mensagem crua com o segredo dentro,
  // que é exatamente o que o cliente real do Upstash faz: a URL REST (com
  // o identificador do banco) e, em falha de transporte, o cabeçalho de
  // autorização aparecem no `message`.
  const vazamentos = [
    `request to ${URL_FALSA}/get/chave failed`,
    `Upstash Redis: 401 Unauthorized (token ${TOKEN_FALSO})`,
    `connect ECONNREFUSED ${URL_FALSA} Authorization: Bearer ${TOKEN_FALSO}`,
  ];

  for (const [i, mensagem] of vazamentos.entries()) {
    test(`erro cru #${i + 1} é sanitizado: nem URL, nem token, nem fragmento`, async () => {
      vi.mocked(obterKvStore).mockReturnValue(
        storeFake(async () => {
          throw new Error(mensagem);
        })
      );
      const r = await checarUpstash();
      const serializado = JSON.stringify(r);

      expect(serializado).not.toContain(URL_FALSA);
      expect(serializado).not.toContain(TOKEN_FALSO);
      // Fragmentos: nem pedaço do host, nem pedaço do token.
      expect(serializado).not.toContain("upstash.io");
      expect(serializado).not.toContain(TOKEN_FALSO.slice(0, 12));
      expect(serializado).not.toMatch(/Bearer|Authorization|ECONNREFUSED|401/i);
      // Só o vocabulário fixo do contrato.
      expect(r.motivo).toBe("falha de conexão");
    });
  }

  test("a mensagem sanitizada não é derivada do conteúdo da exceção", async () => {
    vi.mocked(obterKvStore).mockReturnValue(
      storeFake(async () => {
        throw new Error(`segredo-inesperado-${TOKEN_FALSO}`);
      })
    );
    const r = await checarUpstash();
    expect(["timeout", "falha de conexão"]).toContain(r.motivo);
  });

  test("objeto não-Error lançado também não atravessa", async () => {
    vi.mocked(obterKvStore).mockReturnValue(
      storeFake(async () => {
        throw { url: URL_FALSA, token: TOKEN_FALSO };
      })
    );
    const r = await checarUpstash();
    expect(JSON.stringify(r)).not.toContain(TOKEN_FALSO);
    expect(JSON.stringify(r)).not.toContain(URL_FALSA);
    expect(r.motivo).toBe("falha de conexão");
  });
});

describe("verificarSaudeCompleta — os checks antigos continuam de pé", () => {
  const env = { ...process.env };
  afterEach(() => {
    process.env = { ...env };
  });

  test("Upstash entra no relatório sem deslocar PostgreSQL/R2/Resend", async () => {
    vi.mocked(obterKvStore).mockReturnValue(storeFake(async () => null));
    vi.mocked(prisma.$queryRaw).mockResolvedValue([{ "?column?": 1 }]);

    const r = await verificarSaudeCompleta();
    expect(Object.keys(r.dependencias).sort()).toEqual([
      "postgresql",
      "r2",
      "resend",
      "upstash",
    ]);
    expect(r.dependencias.upstash.ok).toBe(true);
    expect(r.dependencias.postgresql.ok).toBe(true);
  });

  test("Upstash desconfigurado NÃO derruba a saúde geral (fail-open preservado)", async () => {
    vi.mocked(obterKvStore).mockReturnValue(null);
    vi.mocked(prisma.$queryRaw).mockResolvedValue([{ "?column?": 1 }]);

    const r = await verificarSaudeCompleta();
    expect(r.dependencias.upstash.ok).toBe(false);
    // A política de disponibilidade não mudou nesta fase: só o banco
    // decide `saudavel`.
    expect(r.saudavel).toBe(true);
  });

  test("Upstash quebrado também não derruba a saúde geral", async () => {
    vi.mocked(obterKvStore).mockReturnValue(
      storeFake(async () => {
        throw new Error("fetch failed");
      })
    );
    vi.mocked(prisma.$queryRaw).mockResolvedValue([{ "?column?": 1 }]);

    const r = await verificarSaudeCompleta();
    expect(r.dependencias.upstash.ok).toBe(false);
    expect(r.saudavel).toBe(true);
  });

  test("banco fora do ar continua sendo o único que derruba a saúde geral", async () => {
    vi.mocked(obterKvStore).mockReturnValue(storeFake(async () => null));
    vi.mocked(prisma.$queryRaw).mockRejectedValue(new Error("connection refused"));

    const r = await verificarSaudeCompleta();
    expect(r.saudavel).toBe(false);
    expect(r.dependencias.postgresql.ok).toBe(false);
  });

  test("nenhuma credencial de nenhuma dependência aparece no relatório", async () => {
    process.env.RESEND_API_KEY = "re_fake_chave_secreta_123";
    process.env.RESEND_FROM_EMAIL = "nao-responda@exemplo.test";
    vi.mocked(obterKvStore).mockReturnValue(storeFake(async () => null));
    vi.mocked(prisma.$queryRaw).mockResolvedValue([{ "?column?": 1 }]);

    const serializado = JSON.stringify(await verificarSaudeCompleta());
    expect(serializado).not.toContain("re_fake_chave_secreta_123");
    expect(serializado).not.toContain(URL_FALSA);
    expect(serializado).not.toContain(TOKEN_FALSO);
  });
});

describe("os checks que já existiam", () => {
  const env = { ...process.env };
  afterEach(() => {
    process.env = { ...env };
  });

  test("Resend: sem configuração é 'não configurado'", () => {
    delete process.env.RESEND_API_KEY;
    delete process.env.RESEND_FROM_EMAIL;
    expect(checarResendConfigurado()).toEqual({ ok: false, motivo: "não configurado" });
  });

  test("Resend: com as duas variáveis é ok", () => {
    process.env.RESEND_API_KEY = "re_fake";
    process.env.RESEND_FROM_EMAIL = "x@exemplo.test";
    expect(checarResendConfigurado().ok).toBe(true);
  });

  test("PostgreSQL: falha vira motivo genérico, sem a mensagem crua", async () => {
    vi.mocked(prisma.$queryRaw).mockRejectedValue(
      new Error("password authentication failed for user 'segredo'")
    );
    const r = await checarBancoDeDados();
    expect(r.ok).toBe(false);
    expect(JSON.stringify(r)).not.toContain("segredo");
    expect(r.motivo).toBe("falha de conexão");
  });
});

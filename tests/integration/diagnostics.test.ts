import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/papel-atual", () => ({ papelAtual: vi.fn() }));
vi.mock("@/lib/kv-store", () => ({ obterKvStore: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(), notFound: vi.fn() }));

import { papelAtual } from "@/lib/papel-atual";
import { obterKvStore, type KvStore } from "@/lib/kv-store";
import { GET } from "@/app/api/admin/diagnostics/route";

// =======================================================================
// Diagnóstico administrativo (Fase 57)
// =======================================================================
// Duas garantias, e as duas são de segurança: a rota continua fechada
// para quem não é OWNER/ADMIN em produção, e o relatório que ela devolve
// nunca carrega credencial de dependência nenhuma.
//
// PostgreSQL é real aqui (é teste de integração, com banco de verdade);
// o provider de rate limiting é fake, porque nenhum teste deve falar com
// um Upstash real.

const URL_FALSA = "https://exemplo-falso-12345.upstash.io";
const TOKEN_FALSO = "AX4wASQgZmFrZS10b2tlbi1kZS10ZXN0ZQ";

function storeFake(obter: KvStore["obter"]): KvStore {
  return {
    obter,
    incrementarComJanela: vi.fn(),
    definir: vi.fn(),
    remover: vi.fn(),
    ttl: vi.fn(async () => 0),
  } as unknown as KvStore;
}

const env = { ...process.env };

beforeEach(() => {
  vi.mocked(papelAtual).mockReset();
  vi.mocked(obterKvStore).mockReset().mockReturnValue(null);
});

afterEach(() => {
  process.env = { ...env };
});

/** Finge o ambiente de produção, onde a checagem de papel vale. */
function emProducao() {
  process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT = "production";
}

async function chamar() {
  const resposta = await GET();
  return { status: resposta.status, corpo: await resposta.json() };
}

describe("autorização em produção", () => {
  test("não autenticado: 403, e nenhum diagnóstico atravessa", async () => {
    emProducao();
    // papelAtual() devolve undefined para sessão ausente/inativa.
    vi.mocked(papelAtual).mockResolvedValue(undefined);

    const { status, corpo } = await chamar();
    expect(status).toBe(403);
    expect(corpo).not.toHaveProperty("dependencias");
  });

  for (const papel of ["BROKER", "MANAGER", "ASSISTANT"]) {
    test(`${papel} não tem acesso ao diagnóstico`, async () => {
      emProducao();
      vi.mocked(papelAtual).mockResolvedValue(papel);

      const { status, corpo } = await chamar();
      expect(status).toBe(403);
      expect(corpo).not.toHaveProperty("dependencias");
    });
  }

  for (const papel of ["OWNER", "ADMIN"]) {
    test(`${papel} continua enxergando o diagnóstico completo`, async () => {
      emProducao();
      vi.mocked(papelAtual).mockResolvedValue(papel);
      vi.mocked(obterKvStore).mockReturnValue(storeFake(async () => null));

      const { status, corpo } = await chamar();
      expect(status).toBe(200);
      expect(Object.keys(corpo.dependencias).sort()).toEqual([
        "postgresql",
        "r2",
        "resend",
        "upstash",
      ]);
    });
  }

  test("papel inventado não passa (falha fechado)", async () => {
    emProducao();
    vi.mocked(papelAtual).mockResolvedValue("SUPER_ADMIN");
    expect((await chamar()).status).toBe(403);
  });

  test("fora de produção a rota continua liberada, como já era", async () => {
    process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT = "development";
    vi.mocked(papelAtual).mockResolvedValue(undefined);
    expect((await chamar()).status).toBe(200);
  });
});

describe("o relatório nunca vaza credencial", () => {
  beforeEach(() => {
    emProducao();
    vi.mocked(papelAtual).mockResolvedValue("OWNER");
    process.env.UPSTASH_REDIS_REST_URL = URL_FALSA;
    process.env.UPSTASH_REDIS_REST_TOKEN = TOKEN_FALSO;
    process.env.RESEND_API_KEY = "re_fake_chave_secreta_123";
  });

  test("com Upstash saudável, nem URL nem token aparecem", async () => {
    vi.mocked(obterKvStore).mockReturnValue(storeFake(async () => null));

    const { corpo } = await chamar();
    const serializado = JSON.stringify(corpo);
    expect(corpo.dependencias.upstash.ok).toBe(true);
    expect(serializado).not.toContain(URL_FALSA);
    expect(serializado).not.toContain(TOKEN_FALSO);
    expect(serializado).not.toContain("upstash.io");
    expect(serializado).not.toContain("re_fake_chave_secreta_123");
  });

  test("com Upstash quebrado, o erro cru com credencial dentro é sanitizado", async () => {
    vi.mocked(obterKvStore).mockReturnValue(
      storeFake(async () => {
        throw new Error(`GET ${URL_FALSA} failed — Authorization: Bearer ${TOKEN_FALSO}`);
      })
    );

    const { status, corpo } = await chamar();
    // Dependência quebrada não derruba a rota nem a saúde geral.
    expect(status).toBe(200);
    expect(corpo.dependencias.upstash).toEqual({ ok: false, motivo: "falha de conexão" });

    const serializado = JSON.stringify(corpo);
    expect(serializado).not.toContain(URL_FALSA);
    expect(serializado).not.toContain(TOKEN_FALSO);
    expect(serializado).not.toMatch(/Bearer|Authorization/i);
    // Nada de stack trace no corpo.
    expect(serializado).not.toMatch(/at Object|\.ts:\d+|node_modules/);
  });

  test("sem provider configurado, a resposta diz isso sem nenhum valor", async () => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    vi.mocked(obterKvStore).mockReturnValue(null);

    const { corpo } = await chamar();
    expect(corpo.dependencias.upstash).toEqual({ ok: false, motivo: "não configurado" });
    // O administrador vê os NOMES do que falta na documentação, nunca um
    // valor no corpo da resposta.
    expect(JSON.stringify(corpo)).not.toContain(URL_FALSA);
  });
});

describe("os checks que já existiam continuam funcionando", () => {
  beforeEach(() => {
    emProducao();
    vi.mocked(papelAtual).mockResolvedValue("ADMIN");
  });

  test("PostgreSQL é checado de verdade e responde ok", async () => {
    const { corpo } = await chamar();
    // Banco real do ambiente de teste.
    expect(corpo.dependencias.postgresql.ok).toBe(true);
    expect(typeof corpo.dependencias.postgresql.latenciaMs).toBe("number");
    expect(corpo.saudavel).toBe(true);
  });

  test("R2 e Resend continuam presentes no relatório", async () => {
    const { corpo } = await chamar();
    expect(corpo.dependencias.r2).toHaveProperty("ok");
    expect(corpo.dependencias.resend).toHaveProperty("ok");
  });

  test("a saúde geral não passou a depender do Upstash", async () => {
    vi.mocked(obterKvStore).mockReturnValue(null);
    const { corpo } = await chamar();
    expect(corpo.dependencias.upstash.ok).toBe(false);
    expect(corpo.saudavel).toBe(true);
  });
});

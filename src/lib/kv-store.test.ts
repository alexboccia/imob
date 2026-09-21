import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";

// `obterKvStore` memoiza a instância em escopo de módulo (de propósito:
// um cliente por processo). Para exercitar combinações de variáveis é
// preciso reimportar o módulo a cada caso — daí `vi.resetModules()` e o
// import dinâmico abaixo, em vez de chamar a função já carregada.
const URL_FALSA = "https://exemplo-falso-12345.upstash.io";
const TOKEN_FALSO = "AX4wASQgZmFrZS10b2tlbi1kZS10ZXN0ZQ";

const avisos: Array<{ mensagem: string; contexto?: unknown }> = [];

vi.mock("@/lib/logger", () => ({
  logger: {
    warn: (mensagem: string, contexto?: unknown) => avisos.push({ mensagem, contexto }),
    error: () => {},
    info: () => {},
  },
}));

async function carregar(env: { url?: string; token?: string }) {
  vi.resetModules();
  avisos.length = 0;
  if (env.url === undefined) delete process.env.UPSTASH_REDIS_REST_URL;
  else process.env.UPSTASH_REDIS_REST_URL = env.url;
  if (env.token === undefined) delete process.env.UPSTASH_REDIS_REST_TOKEN;
  else process.env.UPSTASH_REDIS_REST_TOKEN = env.token;

  const { obterKvStore } = await import("@/lib/kv-store");
  return obterKvStore();
}

const env = { ...process.env };
beforeEach(() => {
  process.env = { ...env };
});
afterEach(() => {
  process.env = { ...env };
});

describe("obterKvStore — quais variáveis ativam o provider", () => {
  test("as duas ausentes: sem provider", async () => {
    expect(await carregar({})).toBeNull();
  });

  test("somente a URL: sem provider — uma variável sozinha não configura nada", async () => {
    expect(await carregar({ url: URL_FALSA })).toBeNull();
  });

  test("somente o TOKEN: sem provider", async () => {
    expect(await carregar({ token: TOKEN_FALSO })).toBeNull();
  });

  test("string vazia conta como ausente (é assim que .env.test as deixa)", async () => {
    expect(await carregar({ url: "", token: "" })).toBeNull();
    expect(await carregar({ url: URL_FALSA, token: "" })).toBeNull();
  });

  test("as duas presentes: provider instanciado", async () => {
    const store = await carregar({ url: URL_FALSA, token: TOKEN_FALSO });
    expect(store).not.toBeNull();
    // Contrato de KvStore completo — é o que rate-limit.ts consome.
    for (const metodo of ["incrementarComJanela", "obter", "definir", "remover", "ttl"]) {
      expect(typeof (store as unknown as Record<string, unknown>)[metodo]).toBe("function");
    }
  });

  test("a instância é memoizada por processo", async () => {
    await carregar({ url: URL_FALSA, token: TOKEN_FALSO });
    const { obterKvStore } = await import("@/lib/kv-store");
    expect(obterKvStore()).toBe(obterKvStore());
  });
});

describe("obterKvStore — o aviso não vaza credencial", () => {
  test("sem configuração, avisa citando só os NOMES das variáveis", async () => {
    await carregar({});
    expect(avisos).toHaveLength(1);
    expect(avisos[0].mensagem).toContain("UPSTASH_REDIS_REST_URL");
    expect(avisos[0].mensagem).toContain("UPSTASH_REDIS_REST_TOKEN");
  });

  test("com uma variável presente, o valor dela NUNCA entra no aviso", async () => {
    await carregar({ url: URL_FALSA });
    const serializado = JSON.stringify(avisos);
    expect(serializado).not.toContain(URL_FALSA);
    expect(serializado).not.toContain("upstash.io");
    expect(serializado).not.toContain("exemplo-falso-12345");
  });

  test("com o token presente, o token NUNCA entra no aviso", async () => {
    await carregar({ token: TOKEN_FALSO });
    const serializado = JSON.stringify(avisos);
    expect(serializado).not.toContain(TOKEN_FALSO);
    expect(serializado).not.toContain(TOKEN_FALSO.slice(0, 12));
  });

  test("configurado corretamente não gera aviso nenhum", async () => {
    await carregar({ url: URL_FALSA, token: TOKEN_FALSO });
    expect(avisos).toHaveLength(0);
  });
});

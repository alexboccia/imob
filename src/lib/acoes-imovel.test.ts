import { describe, test, expect, afterEach, vi } from "vitest";
import {
  linksDeCompartilhamento,
  textoDeCompartilhamento,
  urlCanonicaDoImovel,
} from "@/lib/compartilhar-imovel";
import {
  LIMITE_FAVORITOS,
  alternarNaLista,
  chaveFavoritos,
  gravarFavoritos,
  lerFavoritos,
  type ArmazenamentoSimples,
} from "@/lib/favoritos";

// =======================================================================
// Compartilhar e salvar (Fase 47) — regras puras
// =======================================================================

afterEach(() => vi.unstubAllEnvs());

describe("urlCanonicaDoImovel", () => {
  test("domínio próprio ativo: https no domínio, sem prefixo de organização", () => {
    expect(
      urlCanonicaDoImovel({ hostnameCustom: "imob.exemplo.com.br", basePath: "/org-x", imovelId: "abc" })
    ).toBe("https://imob.exemplo.com.br/imoveis/abc");
  });

  test("sem domínio próprio: site público + prefixo da organização", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://site.exemplo");
    expect(urlCanonicaDoImovel({ hostnameCustom: null, basePath: "/org-x", imovelId: "abc" })).toBe(
      "https://site.exemplo/org-x/imoveis/abc"
    );
    expect(urlCanonicaDoImovel({ hostnameCustom: null, basePath: "", imovelId: "abc" })).toBe(
      "https://site.exemplo/imoveis/abc"
    );
  });
});

describe("linksDeCompartilhamento", () => {
  const url = "https://site.exemplo/org-x/imoveis/abc?x=1&y=2";
  const titulo = "Apartamento & Vista — 2 quartos #1";
  const links = linksDeCompartilhamento({ url, titulo });

  test("texto curto com o título público", () => {
    expect(textoDeCompartilhamento("  Casa  ")).toBe("Veja este imóvel: Casa");
  });

  test("WhatsApp: sem número (escolhe a conversa), título e URL no texto", () => {
    const u = new URL(links.whatsapp);
    expect(`${u.origin}${u.pathname}`).toBe("https://wa.me/");
    expect(u.searchParams.get("text")).toBe(`Veja este imóvel: ${titulo}\n${url}`);
    // Tudo codificado: nenhum & ou # cru quebra o parâmetro.
    expect([...u.searchParams.keys()]).toEqual(["text"]);
  });

  test("Facebook, LinkedIn e X recebem a URL inteira como um parâmetro", () => {
    expect(new URL(links.facebook).origin).toBe("https://www.facebook.com");
    expect(new URL(links.facebook).searchParams.get("u")).toBe(url);
    expect(new URL(links.linkedin).origin).toBe("https://www.linkedin.com");
    expect(new URL(links.linkedin).searchParams.get("url")).toBe(url);
    const x = new URL(links.x);
    expect(x.searchParams.get("url")).toBe(url);
    expect(x.searchParams.get("text")).toBe(`Veja este imóvel: ${titulo}`);
    expect([...x.searchParams.keys()].sort()).toEqual(["text", "url"]);
  });
});

function armazenamentoFalso(inicial: Record<string, string> = {}) {
  const dados = new Map(Object.entries(inicial));
  const armazenamento: ArmazenamentoSimples = {
    getItem: (k) => dados.get(k) ?? null,
    setItem: (k, v) => void dados.set(k, v),
  };
  return { armazenamento, dados };
}

describe("favoritos", () => {
  test("chave versionada por organização", () => {
    expect(chaveFavoritos("org-a")).toBe("easymob:favoritos:v1:org-a");
    expect(chaveFavoritos("org-a")).not.toBe(chaveFavoritos("org-b"));
  });

  test("gravar e ler, isolado por organização", () => {
    const { armazenamento } = armazenamentoFalso();
    expect(gravarFavoritos(armazenamento, "org-a", ["x"])).toBe(true);
    expect(lerFavoritos(armazenamento, "org-a")).toEqual(["x"]);
    // Mesmo id em outra organização: não é favorito lá.
    expect(lerFavoritos(armazenamento, "org-b")).toEqual([]);
  });

  test("alternar adiciona e remove", () => {
    expect(alternarNaLista([], "x")).toEqual(["x"]);
    expect(alternarNaLista(["a", "x"], "x")).toEqual(["a"]);
  });

  test.each([
    ["não é JSON", "não é JSON"],
    ["objeto", '{"a":1}'],
    ["número", "42"],
    ["null", "null"],
  ])("valor corrompido (%s) é lista vazia, e outras chaves ficam intactas", (_n, bruto) => {
    const { armazenamento, dados } = armazenamentoFalso({
      [chaveFavoritos("org-a")]: bruto,
      "outra-aplicacao": "preservar",
    });
    expect(lerFavoritos(armazenamento, "org-a")).toEqual([]);
    expect(dados.get("outra-aplicacao")).toBe("preservar");
    expect(dados.get(chaveFavoritos("org-a"))).toBe(bruto);
  });

  test("lista com lixo: só ids válidos, sem repetição", () => {
    const { armazenamento } = armazenamentoFalso({
      [chaveFavoritos("org-a")]: JSON.stringify(["a", 1, null, "", "b", "a", { id: "c" }]),
    });
    expect(lerFavoritos(armazenamento, "org-a")).toEqual(["a", "b"]);
  });

  test("armazenamento indisponível ou que lança: nada quebra", () => {
    expect(lerFavoritos(null, "org-a")).toEqual([]);
    expect(gravarFavoritos(null, "org-a", ["x"])).toBe(false);
    const quebrado: ArmazenamentoSimples = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    };
    expect(lerFavoritos(quebrado, "org-a")).toEqual([]);
    expect(gravarFavoritos(quebrado, "org-a", ["x"])).toBe(false);
  });

  test("a lista gravada tem teto (mantém os mais recentes)", () => {
    const { armazenamento } = armazenamentoFalso();
    const ids = Array.from({ length: LIMITE_FAVORITOS + 5 }, (_, i) => `id-${i}`);
    gravarFavoritos(armazenamento, "org-a", ids);
    const lidos = lerFavoritos(armazenamento, "org-a");
    expect(lidos).toHaveLength(LIMITE_FAVORITOS);
    expect(lidos.at(-1)).toBe(`id-${LIMITE_FAVORITOS + 4}`);
  });
});

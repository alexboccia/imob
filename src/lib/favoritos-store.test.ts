import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import {
  EVENTO_FAVORITOS,
  _limparMemoriaFavoritos,
  alternarFavorito,
  inscreverFavoritos,
  listaFavoritosAtual,
  removerFavorito,
} from "@/lib/favoritos-store";
import {
  LIMITE_FAVORITOS,
  chaveFavoritos,
  favoritosMaisRecentesPrimeiro,
  idImovelValido,
} from "@/lib/favoritos";

// =======================================================================
// Store de favoritos no navegador (Fase 49) — a fonte única da ficha, do
// header e da página. Roda em Node com um window mínimo (EventTarget +
// localStorage falso), que é tudo que o store usa.
// =======================================================================

function localStorageFalso(inicial: Record<string, string> = {}) {
  const dados = new Map(Object.entries(inicial));
  return {
    dados,
    storage: {
      getItem: (k: string) => dados.get(k) ?? null,
      setItem: (k: string, v: string) => void dados.set(k, v),
    },
  };
}

function montarJanela(storage: unknown) {
  const janela = new EventTarget() as EventTarget & { localStorage?: unknown };
  Object.defineProperty(janela, "localStorage", {
    get() {
      if (storage === "bloqueado") throw new Error("SecurityError");
      return storage;
    },
  });
  vi.stubGlobal("window", janela);
  return janela;
}

beforeEach(() => _limparMemoriaFavoritos());
afterEach(() => vi.unstubAllGlobals());

describe("alternar, remover, contar", () => {
  test("adiciona no fim, remove, sem duplicata; cada organização com a sua lista", () => {
    const { storage, dados } = localStorageFalso({ "outra-aplicacao": "preservar" });
    montarJanela(storage);

    alternarFavorito("org-a", "a1");
    alternarFavorito("org-a", "a2");
    alternarFavorito("org-b", "b1");
    expect(listaFavoritosAtual("org-a")).toEqual(["a1", "a2"]);
    expect(listaFavoritosAtual("org-b")).toEqual(["b1"]);

    // Alternar de novo remove (não duplica).
    alternarFavorito("org-a", "a1");
    expect(listaFavoritosAtual("org-a")).toEqual(["a2"]);
    alternarFavorito("org-a", "a1");
    expect(listaFavoritosAtual("org-a")).toEqual(["a2", "a1"]);

    // Remover é idempotente e só mexe no id pedido.
    removerFavorito("org-a", "a2");
    removerFavorito("org-a", "a2");
    expect(listaFavoritosAtual("org-a")).toEqual(["a1"]);
    expect(listaFavoritosAtual("org-b")).toEqual(["b1"]);
    expect(JSON.parse(dados.get(chaveFavoritos("org-a"))!)).toEqual(["a1"]);
    expect(dados.get("outra-aplicacao")).toBe("preservar");
  });

  test("a mesma referência enquanto nada muda (exigência do useSyncExternalStore)", () => {
    const { storage } = localStorageFalso();
    montarJanela(storage);
    alternarFavorito("org-a", "a1");
    const primeira = listaFavoritosAtual("org-a");
    expect(listaFavoritosAtual("org-a")).toBe(primeira);
    alternarFavorito("org-a", "a2");
    expect(listaFavoritosAtual("org-a")).not.toBe(primeira);
  });

  test("storage corrompido: lista vazia, e salvar recupera sem tocar em outras chaves", () => {
    const { storage, dados } = localStorageFalso({
      [chaveFavoritos("org-a")]: "{não é json",
      "outra-aplicacao": "preservar",
    });
    montarJanela(storage);
    expect(listaFavoritosAtual("org-a")).toEqual([]);
    alternarFavorito("org-a", "a1");
    expect(listaFavoritosAtual("org-a")).toEqual(["a1"]);
    expect(dados.get("outra-aplicacao")).toBe("preservar");
  });

  test("storage bloqueado: vale em memória durante a visita, por organização", () => {
    montarJanela("bloqueado");
    expect(listaFavoritosAtual("org-a")).toEqual([]);
    alternarFavorito("org-a", "a1");
    alternarFavorito("org-b", "b1");
    expect(listaFavoritosAtual("org-a")).toEqual(["a1"]);
    expect(listaFavoritosAtual("org-b")).toEqual(["b1"]);
    removerFavorito("org-a", "a1");
    expect(listaFavoritosAtual("org-a")).toEqual([]);
  });
});

describe("sincronização", () => {
  test("toda escrita avisa quem está inscrito; cancelar a inscrição para de avisar", () => {
    const { storage } = localStorageFalso();
    montarJanela(storage);
    const aoMudar = vi.fn();
    const cancelar = inscreverFavoritos(aoMudar);

    alternarFavorito("org-a", "a1");
    removerFavorito("org-a", "a1");
    expect(aoMudar).toHaveBeenCalledTimes(2);

    // Remover o que não está salvo não é mudança.
    removerFavorito("org-a", "nao-salvo");
    expect(aoMudar).toHaveBeenCalledTimes(2);

    cancelar();
    alternarFavorito("org-a", "a2");
    expect(aoMudar).toHaveBeenCalledTimes(2);
  });

  test("outra aba: o evento storage do navegador também avisa, e a leitura reflete o novo valor", () => {
    const { storage, dados } = localStorageFalso();
    const janela = montarJanela(storage);
    const aoMudar = vi.fn();
    inscreverFavoritos(aoMudar);

    // A outra aba grava direto no storage e o navegador avisa esta.
    dados.set(chaveFavoritos("org-a"), JSON.stringify(["de-outra-aba"]));
    janela.dispatchEvent(new Event("storage"));
    expect(aoMudar).toHaveBeenCalledTimes(1);
    expect(listaFavoritosAtual("org-a")).toEqual(["de-outra-aba"]);
    expect(EVENTO_FAVORITOS).not.toBe("storage");
  });
});

describe("ordem e ids", () => {
  test("página: mais recente primeiro, com teto mantendo os mais recentes", () => {
    expect(favoritosMaisRecentesPrimeiro(["a", "b", "c"])).toEqual(["c", "b", "a"]);
    const muitos = Array.from({ length: LIMITE_FAVORITOS + 3 }, (_, i) => `id-${i}`);
    const pagina = favoritosMaisRecentesPrimeiro(muitos);
    expect(pagina).toHaveLength(LIMITE_FAVORITOS);
    expect(pagina[0]).toBe(`id-${LIMITE_FAVORITOS + 2}`);
    expect(pagina).not.toContain("id-0");
  });

  test.each([
    ["cuid", "cmsfdhuj1000a88p4bmvqucgw", true],
    ["fixo do seed", "e2e-imovel-navegacao-2", true],
    ["vazio", "", false],
    ["com espaço", "a b", false],
    ["com barra", "../x", false],
    ["com vírgula", "a,b", false],
    ["longo demais", "x".repeat(65), false],
  ])("id público válido? %s", (_n, id, esperado) => {
    expect(idImovelValido(id)).toBe(esperado);
  });
});

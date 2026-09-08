import { describe, test, expect } from "vitest";
import { normalizarSlug, derivarSlug } from "./slug-organizacao";

describe("normalização de slug", () => {
  test("remove acentos em vez de deixar bytes que quebram URL", () => {
    expect(normalizarSlug("Imobiliária Ação")).toBe("imobiliaria-acao");
    expect(normalizarSlug("São João Imóveis")).toBe("sao-joao-imoveis");
  });

  test("minúsculas, espaços e símbolos viram hífen", () => {
    expect(normalizarSlug("Casa & Cia. Imóveis")).toBe("casa-cia-imoveis");
    expect(normalizarSlug("ABC   IMOVEIS")).toBe("abc-imoveis");
  });

  test("nunca produz hífen duplicado, inicial ou final", () => {
    expect(normalizarSlug("  --Imóveis--  ")).toBe("imoveis");
    expect(normalizarSlug("a---b")).toBe("a-b");
  });

  test("respeita o teto de comprimento sem deixar hífen na ponta", () => {
    const longo = normalizarSlug("a".repeat(60));
    expect(longo).toHaveLength(40);
    const cortado = normalizarSlug(`${"a".repeat(39)} bcdef`);
    expect(cortado.endsWith("-")).toBe(false);
  });

  test("é determinística: o mesmo nome sempre produz o mesmo slug", () => {
    const nome = "Imobiliária São Pedro & Filhos";
    expect(normalizarSlug(nome)).toBe(normalizarSlug(nome));
  });
});

describe("derivação de slug", () => {
  test("nome comum vira slug válido", () => {
    expect(derivarSlug("Imobiliária Silva")).toEqual({
      valido: true,
      slug: "imobiliaria-silva",
    });
  });

  test("nome sem nenhum caractere aproveitável é recusado, não inventado", () => {
    // Silenciar isso com um valor gerado daria à imobiliária um endereço
    // que ninguém escolheu e ninguém reconhece.
    expect(derivarSlug("###").valido).toBe(false);
    expect(derivarSlug("   ").valido).toBe(false);
  });

  test("slug curto demais é recusado", () => {
    expect(derivarSlug("A")).toEqual({ valido: false, motivo: "curto" });
  });

  test("slug reservado é recusado — colidiria com uma rota real", () => {
    for (const reservado of ["app", "api", "platform", "contato", "imoveis", "anuncie"]) {
      expect(derivarSlug(reservado)).toEqual({ valido: false, motivo: "reservado" });
    }
  });

  test("a lista de reservados é a mesma do Super Admin, não uma cópia", async () => {
    // Duas listas divergentes deixariam o self-service aceitar um slug
    // que o backoffice recusa — e a rota quebraria só em produção.
    const { SLUGS_RESERVADOS } = await import("@/lib/platform/reserved-words");
    for (const reservado of SLUGS_RESERVADOS) {
      expect(derivarSlug(reservado).valido).toBe(false);
    }
  });

  test("reservado escrito de outro jeito também é barrado", () => {
    // A comparação acontece depois da normalização, dos dois lados. Sem
    // isso, "_next" virava "next" e passava — e qualquer entrada futura
    // com maiúscula ou acento escaparia igual.
    expect(derivarSlug("APP").valido).toBe(false);
    expect(derivarSlug("  Platform  ").valido).toBe(false);
    expect(derivarSlug("_next").valido).toBe(false);
  });

  test("nome legítimo que apenas COMEÇA com palavra reservada é aceito", () => {
    // "Next Imóveis" não colide com rota nenhuma — barrar seria recusar
    // um nome real por excesso de zelo.
    expect(derivarSlug("Next Imóveis")).toEqual({ valido: true, slug: "next-imoveis" });
    expect(derivarSlug("App Imóveis")).toEqual({ valido: true, slug: "app-imoveis" });
  });

  // =====================================================================
  // REGRESSÃO — a classe de problema que "_next" revelou
  // =====================================================================
  // O bug: a comparação acontecia entre o candidato JÁ normalizado e a
  // lista CRUA. "_next" normaliza para "next", que não estava na lista
  // crua, e passava. Qualquer entrada futura com maiúscula, acento,
  // ponto ou underscore escaparia do mesmo jeito.
  //
  // A correção não foi acrescentar "next" à lista: foi comparar os dois
  // lados no MESMO espaço normalizado. Estes casos existem para que
  // ninguém volte atrás.
  test("nenhuma grafia que normalize para um namespace reservado é aceita", () => {
    const variantes = [
      "_next",
      "NEXT",
      "Next",
      "  next  ",
      "-next-",
      "n-e-x-t".replace(/-/g, ""),
      "APP",
      " App ",
      "a p p".replace(/ /g, ""),
      "PLATFORM",
      "Platform",
      "plátform".normalize("NFC"),
      "API",
      "Cadastro",
      "CADASTRO",
      "cadastró",
      "Imóveis".replace("ó", "o"),
      "IMOVEIS",
      "Contato",
      "ANUNCIE",
      "Vendidos",
    ];

    for (const variante of variantes) {
      const resultado = derivarSlug(variante);
      expect(
        resultado.valido,
        `"${variante}" normalizou para "${normalizarSlug(variante)}" e foi aceito`
      ).toBe(false);
    }
  });

  test("acentos são removidos ANTES da comparação, não depois", () => {
    // "imóveis" e "IMÓVEIS" viram "imoveis", que é reservado porque
    // /imoveis é um rewrite para a organização padrão.
    expect(normalizarSlug("imóveis")).toBe("imoveis");
    expect(derivarSlug("imóveis").valido).toBe(false);
    expect(derivarSlug("IMÓVEIS").valido).toBe(false);
  });

  test("underscore e hífens repetidos não criam brechas", () => {
    expect(normalizarSlug("_app_")).toBe("app");
    expect(derivarSlug("_app_").valido).toBe(false);
    expect(normalizarSlug("--api--")).toBe("api");
    expect(derivarSlug("--api--").valido).toBe(false);
  });
});

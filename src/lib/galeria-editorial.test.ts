import { describe, test, expect } from "vitest";
import {
  LIMITE_LEGENDA_FOTO,
  LIMITE_SUBTITULO_DESTAQUE,
  LIMITE_TITULO_DESTAQUE,
  camposImovel,
  imovelSchema,
  normalizarLegenda,
  parseMidias,
} from "@/lib/property-mapper";
import { entregaPrevistaDoDestaque, previsaoEntregaMesAno } from "@/lib/imovel-lancamento";

// =======================================================================
// Conteúdo editorial da galeria (Fase 45) — regras puras
// =======================================================================

const base = {
  titulo: "Apartamento teste",
  tipo: "Apartamento",
  finalidade: "SALE",
  status: "AVAILABLE",
  bairro: "Centro",
  cidade: "São Paulo",
  estado: "SP",
};

function validar(campos: Record<string, string>) {
  return imovelSchema.safeParse({ ...base, ...campos });
}

describe("normalizarLegenda", () => {
  test.each([
    [null, null],
    [undefined, null],
    ["", null],
    ["   ", null],
    ["\n\t ", null],
    [42, null],
    ["  Academia  ", "Academia"],
    ["Espaço   gourmet", "Espaço gourmet"],
    ["Varanda\ngourmet", "Varanda gourmet"],
    ["Suíte máster — vista", "Suíte máster — vista"],
    ["<script>alert(1)</script>", "<script>alert(1)</script>"],
  ])("%j → %j", (entrada, esperado) => {
    expect(normalizarLegenda(entrada)).toBe(esperado);
  });
});

describe("parseMidias — legenda", () => {
  test("a legenda viaja com a foto, na ordem da lista", () => {
    const midias = parseMidias(
      JSON.stringify([
        { tipo: "FOTO", url: "https://x/b.jpg", ehCapa: false, legenda: "Academia" },
        { tipo: "FOTO", url: "https://x/c.jpg", ehCapa: false },
        { tipo: "FOTO", url: "https://x/a.jpg", ehCapa: true, legenda: " Fachada " },
      ])
    );
    expect(midias.map((m) => [m.url, m.caption, m.order, m.isCover])).toEqual([
      ["https://x/b.jpg", "Academia", 0, false],
      ["https://x/c.jpg", null, 1, false],
      ["https://x/a.jpg", "Fachada", 2, true],
    ]);
  });

  test("vazio e só espaços viram null", () => {
    const midias = parseMidias(
      JSON.stringify([
        { tipo: "FOTO", url: "https://x/1.jpg", ehCapa: true, legenda: "" },
        { tipo: "FOTO", url: "https://x/2.jpg", ehCapa: false, legenda: "   " },
      ])
    );
    expect(midias.map((m) => m.caption)).toEqual([null, null]);
  });

  test("legenda só existe em foto", () => {
    const midias = parseMidias(
      JSON.stringify([
        { tipo: "PLANTA", url: "https://x/p.jpg", ehCapa: false, legenda: "Planta tipo" },
        { tipo: "VIDEO", url: "https://x/v", ehCapa: false, legenda: "Tour" },
      ])
    );
    expect(midias.map((m) => m.caption)).toEqual([null, null]);
  });

  test("campos injetados (id, organizationId, propertyId) não chegam ao banco", () => {
    const [midia] = parseMidias(
      JSON.stringify([
        {
          tipo: "FOTO",
          url: "https://x/1.jpg",
          ehCapa: true,
          legenda: "Fachada",
          id: "media-de-outro-imovel",
          organizationId: "org-alheia",
          propertyId: "imovel-alheio",
          caption: "forjada",
        },
      ])
    );
    expect(Object.keys(midia).sort()).toEqual(["caption", "isCover", "order", "type", "url"]);
    expect(midia.caption).toBe("Fachada");
  });
});

describe("imovelSchema — limites editoriais", () => {
  test("legenda no limite passa; um caractere a mais recusa o salvamento", () => {
    const noLimite = "a".repeat(LIMITE_LEGENDA_FOTO);
    const ok = validar({
      midiasJson: JSON.stringify([{ tipo: "FOTO", url: "https://x/1.jpg", ehCapa: true, legenda: noLimite }]),
    });
    expect(ok.success).toBe(true);

    const longa = validar({
      midiasJson: JSON.stringify([
        { tipo: "FOTO", url: "https://x/1.jpg", ehCapa: true, legenda: noLimite + "b" },
      ]),
    });
    expect(longa.success).toBe(false);
    expect(longa.error!.flatten().fieldErrors.midiasJson?.[0]).toContain(`${LIMITE_LEGENDA_FOTO} caracteres`);
  });

  test("o limite conta o texto já aparado", () => {
    const r = validar({
      midiasJson: JSON.stringify([
        { tipo: "FOTO", url: "https://x/1.jpg", ehCapa: true, legenda: `   ${"a".repeat(LIMITE_LEGENDA_FOTO)}   ` },
      ]),
    });
    expect(r.success).toBe(true);
  });

  test("título e subtítulo: limite depois do trim", () => {
    expect(validar({ tituloDestaque: "a".repeat(LIMITE_TITULO_DESTAQUE) }).success).toBe(true);
    expect(validar({ tituloDestaque: ` ${"a".repeat(LIMITE_TITULO_DESTAQUE)} ` }).success).toBe(true);
    const titulo = validar({ tituloDestaque: "a".repeat(LIMITE_TITULO_DESTAQUE + 1) });
    expect(titulo.success).toBe(false);
    expect(titulo.error!.flatten().fieldErrors.tituloDestaque).toBeDefined();

    expect(validar({ subtituloDestaque: "a".repeat(LIMITE_SUBTITULO_DESTAQUE) }).success).toBe(true);
    const sub = validar({ subtituloDestaque: "a".repeat(LIMITE_SUBTITULO_DESTAQUE + 1) });
    expect(sub.success).toBe(false);
    expect(sub.error!.flatten().fieldErrors.subtituloDestaque).toBeDefined();
  });

  test("camposImovel: vazio ou só espaços viram null; texto é aparado e mantido puro", () => {
    const vazio = validar({ tituloDestaque: "   ", subtituloDestaque: "" });
    expect(vazio.success).toBe(true);
    const campos = camposImovel({
      ...vazio.data!,
      caracteristicasImovel: [],
      caracteristicasCondominio: [],
    });
    expect(campos.heroTitle).toBeNull();
    expect(campos.heroSubtitle).toBeNull();

    const cheio = validar({
      tituloDestaque: "  Um novo jeito de viver em Santana ",
      subtituloDestaque: "<b>Conforto</b>, modernidade",
    });
    const c = camposImovel({ ...cheio.data!, caracteristicasImovel: [], caracteristicasCondominio: [] });
    expect(c.heroTitle).toBe("Um novo jeito de viver em Santana");
    expect(c.heroSubtitle).toBe("<b>Conforto</b>, modernidade");
  });
});

describe("selo de entrega da foto de destaque", () => {
  const nov2027 = new Date(Date.UTC(2027, 10, 1));

  test("formato Mês/Ano, lido em UTC", () => {
    expect(previsaoEntregaMesAno(nov2027)).toBe("Nov/2027");
    expect(previsaoEntregaMesAno(new Date(Date.UTC(2028, 2, 1)))).toBe("Mar/2028");
    expect(previsaoEntregaMesAno(new Date(Date.UTC(2026, 1, 1)))).toBe("Fev/2026");
    // Dia 1 em UTC continua sendo o mesmo mês mesmo que o processo rode
    // em fuso negativo: getUTCMonth, nunca getMonth.
    expect(previsaoEntregaMesAno(new Date("2027-11-01T00:00:00.000Z"))).toBe("Nov/2027");
    expect(previsaoEntregaMesAno(null)).toBeNull();
  });

  test.each([
    ["lançamento com data", { isLaunch: true, constructionStage: null, deliveryForecast: nov2027 }, "Nov/2027"],
    ["em construção com data", { isLaunch: false, constructionStage: "UNDER_CONSTRUCTION", deliveryForecast: nov2027 }, "Nov/2027"],
    ["na planta com data", { isLaunch: false, constructionStage: "PRE_CONSTRUCTION", deliveryForecast: nov2027 }, "Nov/2027"],
    ["pronto com data", { isLaunch: false, constructionStage: "READY_TO_MOVE", deliveryForecast: nov2027 }, null],
    ["sem estágio, não lançamento, com data", { isLaunch: false, constructionStage: null, deliveryForecast: nov2027 }, null],
    ["lançamento sem data", { isLaunch: true, constructionStage: null, deliveryForecast: null }, null],
  ])("%s", (_nome, imovel, esperado) => {
    expect(entregaPrevistaDoDestaque(imovel)).toBe(esperado);
  });
});

describe("título e subtítulo — uma linha de texto puro", () => {
  test("quebras e espaços repetidos viram um espaço antes do limite", () => {
    const r = validar({
      tituloDestaque: "Um novo jeito\n\nde viver",
      subtituloDestaque: `  Conforto,\r\n   modernidade  ${" ".repeat(200)}`,
    });
    expect(r.success).toBe(true);
    const c = camposImovel({ ...r.data!, caracteristicasImovel: [], caracteristicasCondominio: [] });
    expect(c.heroTitle).toBe("Um novo jeito de viver");
    expect(c.heroSubtitle).toBe("Conforto, modernidade");
  });
});

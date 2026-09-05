import { describe, test, expect } from "vitest";
import {
  interpretarPeriodoAnalytics,
  resolverJanelasAnalytics,
  granularidadeDe,
  compararComPeriodoAnterior,
  direcaoVariacao,
  textoVariacao,
  construirSerie,
  distribuirPorOrigem,
  contarDistintos,
  contarContatosPorImovel,
  ranquearImoveis,
  eOrigemComercial,
  whereContatoComercial,
  PERIODO_ANALYTICS_DIAS,
} from "@/lib/analytics-comercial";
import { formatarPercentualInteiro } from "@/lib/format";

// Executa `fn` com o TZ do processo forçado — as agregações são
// UTC-literais por convenção do projeto (ver cabeçalho de
// analytics-comercial.ts) e precisam dar o MESMO resultado em qualquer
// fuso, senão um contato feito às 21h no Brasil cairia no dia seguinte.
function comTimezone(tz: string, fn: () => void) {
  const anterior = process.env.TZ;
  process.env.TZ = tz;
  try {
    fn();
  } finally {
    process.env.TZ = anterior;
  }
}

const FUSOS = ["UTC", "America/Sao_Paulo", "Asia/Tokyo"];

describe("interpretarPeriodoAnalytics", () => {
  test("aceita os períodos do catálogo", () => {
    expect(interpretarPeriodoAnalytics({ periodo: "7d" })).toBe("7d");
    expect(interpretarPeriodoAnalytics({ periodo: "30d" })).toBe("30d");
    expect(interpretarPeriodoAnalytics({ periodo: "13s" })).toBe("13s");
  });

  test("normaliza caixa e espaços", () => {
    expect(interpretarPeriodoAnalytics({ periodo: " 13S " })).toBe("13s");
  });

  test("cai no padrão de 30 dias para input ausente, vazio ou inválido", () => {
    expect(interpretarPeriodoAnalytics({})).toBe("30d");
    expect(interpretarPeriodoAnalytics({ periodo: "" })).toBe("30d");
    expect(interpretarPeriodoAnalytics({ periodo: "90d" })).toBe("30d");
    expect(interpretarPeriodoAnalytics({ periodo: "__proto__" })).toBe("30d");
  });
});

describe("resolverJanelasAnalytics", () => {
  // 12/03/2026 às 23:30 UTC — hora tardia de propósito: com getters
  // locais (em vez de getUTC*) o início da janela escorregaria um dia.
  const agora = new Date("2026-03-12T23:30:00.000Z");

  test("janela atual cobre N dias calendário UTC fechados, terminando hoje", () => {
    const { atual, dias } = resolverJanelasAnalytics("7d", agora);
    expect(dias).toBe(7);
    expect(atual.inicio.toISOString()).toBe("2026-03-06T00:00:00.000Z");
    expect(atual.fim.toISOString()).toBe("2026-03-12T23:59:59.999Z");
  });

  test("período anterior tem o MESMO comprimento e termina 1ms antes do atual", () => {
    const { atual, anterior } = resolverJanelasAnalytics("30d", agora);
    expect(anterior.fim.getTime()).toBe(atual.inicio.getTime() - 1);
    const duracao = (j: { inicio: Date; fim: Date }) => j.fim.getTime() + 1 - j.inicio.getTime();
    expect(duracao(anterior)).toBe(duracao(atual));
    expect(duracao(atual)).toBe(30 * 24 * 60 * 60 * 1000);
  });

  test("13 semanas são 91 dias exatos — 13 baldes de 7 dias, nenhum parcial", () => {
    expect(PERIODO_ANALYTICS_DIAS["13s"]).toBe(91);
    expect(PERIODO_ANALYTICS_DIAS["13s"] % 7).toBe(0);
    const { atual } = resolverJanelasAnalytics("13s", agora);
    const totalDias = (atual.fim.getTime() + 1 - atual.inicio.getTime()) / (24 * 60 * 60 * 1000);
    expect(totalDias).toBe(91);
  });

  test("determinístico sob UTC / America/Sao_Paulo / Asia/Tokyo", () => {
    const esperado: string[] = [];
    for (const tz of FUSOS) {
      comTimezone(tz, () => {
        const { atual, anterior } = resolverJanelasAnalytics("30d", agora);
        esperado.push(
          [atual.inicio, atual.fim, anterior.inicio, anterior.fim].map((d) => d.toISOString()).join("|")
        );
      });
    }
    expect(new Set(esperado).size).toBe(1);
  });

  test("atravessa virada de mês e de ano sem buraco entre as janelas", () => {
    const { atual, anterior } = resolverJanelasAnalytics("7d", new Date("2027-01-02T10:00:00.000Z"));
    expect(atual.inicio.toISOString()).toBe("2026-12-27T00:00:00.000Z");
    expect(anterior.inicio.toISOString()).toBe("2026-12-20T00:00:00.000Z");
    expect(anterior.fim.toISOString()).toBe("2026-12-26T23:59:59.999Z");
  });
});

describe("granularidadeDe", () => {
  test("dia para 7d/30d e semana para 13s (nunca 91 pontos diários)", () => {
    expect(granularidadeDe("7d")).toBe("DIA");
    expect(granularidadeDe("30d")).toBe("DIA");
    expect(granularidadeDe("13s")).toBe("SEMANA");
  });
});

describe("compararComPeriodoAnterior / divisão por zero", () => {
  test("percentual normal", () => {
    const c = compararComPeriodoAnterior(15, 12);
    expect(c.diferenca).toBe(3);
    expect(c.percentual).toBeCloseTo(25);
    expect(direcaoVariacao(c)).toBe("ALTA");
    expect(textoVariacao(c)).toBe("+25% vs. período anterior");
  });

  test("queda", () => {
    const c = compararComPeriodoAnterior(8, 10);
    expect(c.percentual).toBeCloseTo(-20);
    expect(direcaoVariacao(c)).toBe("BAIXA");
    expect(textoVariacao(c)).toBe("−20% vs. período anterior");
  });

  test("período anterior ZERO nunca vira Infinity/NaN/9999% — vira diferença absoluta", () => {
    const c = compararComPeriodoAnterior(5, 0);
    expect(c.percentual).toBeNull();
    expect(Number.isFinite(c.diferenca)).toBe(true);
    expect(direcaoVariacao(c)).toBe("SEM_BASE");
    const texto = textoVariacao(c);
    expect(texto).toBe("5 contatos — sem contatos no período anterior");
    expect(texto).not.toMatch(/Infinity|NaN|∞/);
  });

  test("um único contato sem base usa singular", () => {
    expect(textoVariacao(compararComPeriodoAnterior(1, 0))).toBe(
      "1 contato — sem contatos no período anterior"
    );
  });

  test("ambos zero: estável, sem percentual e sem texto técnico", () => {
    const c = compararComPeriodoAnterior(0, 0);
    expect(c.percentual).toBeNull();
    expect(direcaoVariacao(c)).toBe("ESTAVEL");
    expect(textoVariacao(c)).toBe("Sem variação vs. período anterior");
  });

  test("mesmo valor nos dois períodos é estável, não 0%", () => {
    expect(direcaoVariacao(compararComPeriodoAnterior(7, 7))).toBe("ESTAVEL");
  });
});

describe("formatarPercentualInteiro", () => {
  test("sem casas decimais falsas e com sinal explícito", () => {
    expect(formatarPercentualInteiro(23.7)).toBe("+24%");
    expect(formatarPercentualInteiro(-12.2)).toBe("−12%");
    expect(formatarPercentualInteiro(0)).toBe("0%");
  });
});

describe("construirSerie", () => {
  const janela = {
    inicio: new Date("2026-03-06T00:00:00.000Z"),
    fim: new Date("2026-03-12T23:59:59.999Z"),
  };

  test("materializa TODOS os dias da janela, inclusive os sem contato", () => {
    const serie = construirSerie(
      [
        { occurredAt: new Date("2026-03-06T09:00:00.000Z") },
        { occurredAt: new Date("2026-03-06T18:00:00.000Z") },
        { occurredAt: new Date("2026-03-08T12:00:00.000Z") },
      ],
      janela,
      "DIA"
    );
    expect(serie).toHaveLength(7);
    expect(serie.map((p) => p.total)).toEqual([2, 0, 1, 0, 0, 0, 0]);
    // O dia sem contato existe como ponto com zero — nunca some fazendo
    // 06/03 ligar direto em 08/03 como se fossem consecutivos.
    expect(serie[1].rotulo).toBe("07/03");
    expect(serie[1].total).toBe(0);
  });

  test("série inteiramente vazia continua tendo um ponto por dia", () => {
    const serie = construirSerie([], janela, "DIA");
    expect(serie).toHaveLength(7);
    expect(serie.every((p) => p.total === 0)).toBe(true);
  });

  test("granularidade semanal produz 13 baldes de 7 dias, com rótulo de intervalo", () => {
    const janela13 = {
      inicio: new Date("2026-01-01T00:00:00.000Z"),
      fim: new Date("2026-04-01T23:59:59.999Z"),
    };
    const serie = construirSerie(
      [
        { occurredAt: new Date("2026-01-01T00:00:00.000Z") },
        { occurredAt: new Date("2026-01-07T23:59:59.000Z") },
        { occurredAt: new Date("2026-01-08T00:00:00.000Z") },
      ],
      janela13,
      "SEMANA"
    );
    expect(serie).toHaveLength(13);
    expect(serie[0].total).toBe(2);
    expect(serie[1].total).toBe(1);
    expect(serie[0].rotuloLongo).toBe("01/01 a 07/01");
  });

  test("contato à noite no Brasil cai no dia UTC correspondente, sem escorregar de balde", () => {
    for (const tz of FUSOS) {
      comTimezone(tz, () => {
        const serie = construirSerie(
          [
            // 06/03 23:59 UTC — extremo superior do primeiro dia.
            { occurredAt: new Date("2026-03-06T23:59:59.999Z") },
            // 07/03 00:00 UTC — primeiro instante do segundo dia.
            { occurredAt: new Date("2026-03-07T00:00:00.000Z") },
          ],
          janela,
          "DIA"
        );
        expect(serie[0].total).toBe(1);
        expect(serie[1].total).toBe(1);
      });
    }
  });

  test("evento fora da janela é ignorado, nunca estoura o array", () => {
    const serie = construirSerie(
      [
        { occurredAt: new Date("2026-03-01T10:00:00.000Z") },
        { occurredAt: new Date("2026-03-20T10:00:00.000Z") },
      ],
      janela,
      "DIA"
    );
    expect(serie).toHaveLength(7);
    expect(serie.reduce((s, p) => s + p.total, 0)).toBe(0);
  });
});

describe("distribuirPorOrigem", () => {
  test("distribui entre as origens reais e soma 100%", () => {
    const itens = distribuirPorOrigem([
      { origin: "IMOVEL" },
      { origin: "IMOVEL" },
      { origin: "CONTATO" },
      { origin: "ANUNCIE" },
    ]);
    expect(itens).toHaveLength(3);
    expect(itens[0]).toMatchObject({ origem: "IMOVEL", rotulo: "Página do imóvel", total: 2 });
    expect(itens[0].percentual).toBeCloseTo(50);
    expect(itens.reduce((s, i) => s + i.percentual, 0)).toBeCloseTo(100);
  });

  test("origem NULA e origem fora do catálogo não entram na decomposição", () => {
    const itens = distribuirPorOrigem([
      { origin: "CONTATO" },
      { origin: null },
      { origin: "PORTAL_FUTURO" },
      { origin: "toString" },
    ]);
    expect(itens.reduce((s, i) => s + i.total, 0)).toBe(1);
  });

  test("sem nenhum contato: três linhas em 0%, nunca NaN", () => {
    const itens = distribuirPorOrigem([]);
    expect(itens).toHaveLength(3);
    for (const item of itens) {
      expect(item.total).toBe(0);
      expect(Number.isNaN(item.percentual)).toBe(false);
      expect(item.percentual).toBe(0);
    }
  });

  test("origem zerada continua visível (0 contatos pelo imóvel é diagnóstico)", () => {
    const itens = distribuirPorOrigem([{ origin: "CONTATO" }]);
    expect(itens.map((i) => i.origem).sort()).toEqual(["ANUNCIE", "CONTATO", "IMOVEL"]);
    expect(itens.find((i) => i.origem === "IMOVEL")!.total).toBe(0);
  });

  test("empate mantém a ordem canônica do catálogo (estável entre refreshes)", () => {
    const itens = distribuirPorOrigem([{ origin: "ANUNCIE" }, { origin: "IMOVEL" }]);
    expect(itens.map((i) => i.origem)).toEqual(["IMOVEL", "ANUNCIE", "CONTATO"]);
  });
});

describe("eOrigemComercial / whereContatoComercial", () => {
  test("só origem do catálogo é contato comercial", () => {
    expect(eOrigemComercial("IMOVEL")).toBe(true);
    expect(eOrigemComercial("CONTATO")).toBe(true);
    expect(eOrigemComercial("ANUNCIE")).toBe(true);
    expect(eOrigemComercial(null)).toBe(false);
    expect(eOrigemComercial(undefined)).toBe(false);
    expect(eOrigemComercial("VISIT")).toBe(false);
    // Herdado de Object.prototype — nunca aceito como origem.
    expect(eOrigemComercial("constructor")).toBe(false);
  });

  test("o filtro usa `in` do catálogo, nunca `not: null` (legado ficaria dentro)", () => {
    const where = whereContatoComercial();
    expect(where.origin.in.sort()).toEqual(["ANUNCIE", "CONTATO", "IMOVEL"]);
    // Array novo a cada chamada: mutar um nunca contamina o próximo.
    whereContatoComercial().origin.in.push("LIXO");
    expect(whereContatoComercial().origin.in).toHaveLength(3);
  });
});

describe("contarDistintos — interações NÃO são pessoas", () => {
  test("a mesma pessoa com várias interações conta uma vez", () => {
    const eventos = [
      { personId: "p1" },
      { personId: "p1" },
      { personId: "p1" },
      { personId: "p2" },
    ];
    expect(eventos).toHaveLength(4);
    expect(contarDistintos(eventos, (e) => e.personId)).toBe(2);
  });

  test("ignora nulos sem contá-los como uma chave", () => {
    expect(contarDistintos([{ id: null }, { id: "a" }, { id: undefined }], (e) => e.id)).toBe(1);
  });

  test("lista vazia é 0, nunca undefined", () => {
    expect(contarDistintos([], (e: { id: string }) => e.id)).toBe(0);
  });
});

describe("top imóveis", () => {
  const eventos = [
    { propertyId: "imovel-b" },
    { propertyId: "imovel-b" },
    { propertyId: "imovel-b" },
    { propertyId: "imovel-a" },
    { propertyId: null },
    { propertyId: null },
  ];

  test("agrupa por imóvel e ignora contato geral (sem propertyId)", () => {
    const contagem = contarContatosPorImovel(eventos);
    expect(contagem.get("imovel-b")).toBe(3);
    expect(contagem.get("imovel-a")).toBe(1);
    expect(contagem.size).toBe(2);
  });

  test("ranqueia por volume e respeita o teto", () => {
    const ranking = ranquearImoveis(contarContatosPorImovel(eventos), 5);
    expect(ranking).toEqual([
      { propertyId: "imovel-b", contatos: 3 },
      { propertyId: "imovel-a", contatos: 1 },
    ]);
    expect(ranquearImoveis(contarContatosPorImovel(eventos), 1)).toHaveLength(1);
  });

  test("imóvel sem nenhum contato simplesmente não aparece (nunca linha em zero)", () => {
    const contagem = contarContatosPorImovel([{ propertyId: "so-esse" }]);
    expect(contagem.has("imovel-sem-contato")).toBe(false);
    expect(ranquearImoveis(contagem, 5).map((r) => r.propertyId)).toEqual(["so-esse"]);
  });

  test("empate é desempatado deterministicamente (mesma ordem a cada refresh)", () => {
    const contagem = new Map([
      ["zzz", 2],
      ["aaa", 2],
    ]);
    expect(ranquearImoveis(contagem, 5).map((r) => r.propertyId)).toEqual(["aaa", "zzz"]);
  });

  test("nenhum contato com imóvel: ranking vazio, sem quebrar", () => {
    expect(ranquearImoveis(contarContatosPorImovel([{ propertyId: null }]), 5)).toEqual([]);
  });
});

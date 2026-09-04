import { describe, test, expect } from "vitest";
import {
  imovelSchema,
  parseImovelFormData,
  camposImovel,
  parseMidias,
  midiasParaCriar,
  type DadosImovelFormulario,
} from "@/lib/property-mapper";

function formDataMinimoValido(overrides: Record<string, string> = {}): FormData {
  const fd = new FormData();
  const base: Record<string, string> = {
    titulo: "Apartamento 2 quartos",
    tipo: "Apartamento",
    finalidade: "SALE",
    status: "AVAILABLE",
    bairro: "Pinheiros",
    cidade: "São Paulo",
    estado: "SP",
    ...overrides,
  };
  for (const [chave, valor] of Object.entries(base)) fd.set(chave, valor);
  return fd;
}

describe("imovelSchema", () => {
  test("aceita os campos mínimos exigidos", () => {
    const r = imovelSchema.safeParse({
      titulo: "Apartamento 2 quartos",
      tipo: "Apartamento",
      finalidade: "SALE",
      status: "AVAILABLE",
      bairro: "Pinheiros",
      cidade: "São Paulo",
      estado: "SP",
    });
    expect(r.success).toBe(true);
  });

  test("recusa título muito curto", () => {
    const r = imovelSchema.safeParse({
      titulo: "Ap",
      tipo: "Apartamento",
      finalidade: "SALE",
      status: "AVAILABLE",
      bairro: "Pinheiros",
      cidade: "São Paulo",
      estado: "SP",
    });
    expect(r.success).toBe(false);
  });

  test("recusa finalidade fora do enum", () => {
    const r = imovelSchema.safeParse({
      titulo: "Apartamento 2 quartos",
      tipo: "Apartamento",
      finalidade: "ALUGUEL",
      status: "AVAILABLE",
      bairro: "Pinheiros",
      cidade: "São Paulo",
      estado: "SP",
    });
    expect(r.success).toBe(false);
  });

  test("recusa UF com mais de 2 caracteres", () => {
    const r = imovelSchema.safeParse({
      titulo: "Apartamento 2 quartos",
      tipo: "Apartamento",
      finalidade: "SALE",
      status: "AVAILABLE",
      bairro: "Pinheiros",
      cidade: "São Paulo",
      estado: "São Paulo",
    });
    expect(r.success).toBe(false);
  });

  test("campos numéricos opcionais vazios viram undefined, não erro", () => {
    const r = imovelSchema.safeParse({
      titulo: "Apartamento 2 quartos",
      tipo: "Apartamento",
      finalidade: "SALE",
      status: "AVAILABLE",
      bairro: "Pinheiros",
      cidade: "São Paulo",
      estado: "SP",
      preco: "",
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.preco).toBe(undefined);
  });
});

describe("parseImovelFormData", () => {
  test("aceita FormData válido e agrega as características multi-valor", () => {
    const fd = formDataMinimoValido();
    fd.append("caracteristicasImovel", "piscina");
    fd.append("caracteristicasImovel", "churrasqueira");
    fd.append("caracteristicasCondominio", "portaria-24h");

    const r = parseImovelFormData(fd);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.dados.caracteristicasImovel).toEqual(["piscina", "churrasqueira"]);
      expect(r.dados.caracteristicasCondominio).toEqual(["portaria-24h"]);
    }
  });

  test("FormData sem características retorna arrays vazios, não erro", () => {
    const r = parseImovelFormData(formDataMinimoValido());
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.dados.caracteristicasImovel).toEqual([]);
      expect(r.dados.caracteristicasCondominio).toEqual([]);
    }
  });

  test("FormData inválido retorna estado de erro de validação", () => {
    const fd = formDataMinimoValido({ titulo: "Ap" });
    const r = parseImovelFormData(fd);
    expect(r.ok).toBe(false);
  });
});

describe("camposImovel", () => {
  function dados(overrides: Partial<DadosImovelFormulario> = {}): DadosImovelFormulario {
    return {
      titulo: "Apartamento 2 quartos",
      tipo: "Apartamento",
      finalidade: "SALE",
      status: "AVAILABLE",
      bairro: "Pinheiros",
      cidade: "São Paulo",
      estado: "sp",
      lancamento: false,
      destaque: false,
      oportunidade: false,
      slideshow: false,
      caracteristicasImovel: [],
      caracteristicasCondominio: [],
      ...overrides,
    };
  }

  test("mapeia campos de português pro nome de coluna em inglês do Prisma", () => {
    const campos = camposImovel(dados());
    expect(campos.title).toBe("Apartamento 2 quartos");
    expect(campos.type).toBe("Apartamento");
    expect(campos.purpose).toBe("SALE");
    expect(campos.neighborhood).toBe("Pinheiros");
    expect(campos.city).toBe("São Paulo");
  });

  test("normaliza a UF para maiúsculas", () => {
    expect(camposImovel(dados({ estado: "sp" })).state).toBe("SP");
  });

  test("campos numéricos ausentes viram null, não undefined (Prisma-safe)", () => {
    const campos = camposImovel(dados());
    expect(campos.price).toBe(null);
    expect(campos.bedrooms).toBe(null);
  });

  test("descrição vazia vira null", () => {
    expect(camposImovel(dados({ descricao: undefined })).description).toBe(null);
  });
});

describe("parseMidias", () => {
  test("retorna array vazio para entrada undefined", () => {
    expect(parseMidias(undefined)).toEqual([]);
  });

  test("retorna array vazio para JSON inválido, sem lançar erro", () => {
    expect(parseMidias("{not valid json")).toEqual([]);
  });

  test("mapeia tipo em português pro MediaType em inglês, preservando ordem", () => {
    const json = JSON.stringify([
      { tipo: "FOTO", url: "https://x/1.jpg", ehCapa: true },
      { tipo: "PLANTA", url: "https://x/2.jpg", ehCapa: false },
      { tipo: "VIDEO", url: "https://x/3.mp4", ehCapa: false },
    ]);
    const midias = parseMidias(json);
    expect(midias).toEqual([
      { type: "PHOTO", url: "https://x/1.jpg", isCover: true, order: 0 },
      { type: "FLOOR_PLAN", url: "https://x/2.jpg", isCover: false, order: 1 },
      { type: "VIDEO", url: "https://x/3.mp4", isCover: false, order: 2 },
    ]);
  });
});

describe("midiasParaCriar", () => {
  test("injeta organizationId em cada mídia, sem alterar os demais campos", () => {
    const midias = [{ type: "PHOTO" as const, url: "https://x/1.jpg", isCover: true, order: 0 }];
    expect(midiasParaCriar(midias, "org-a")).toEqual([
      { type: "PHOTO", url: "https://x/1.jpg", isCover: true, order: 0, organizationId: "org-a" },
    ]);
  });
});

// ---------------------------------------------------------------------
// Campos de lançamento (Fase 3.1). A previsão de entrega vem de um
// <input type="month">, é gravada como Date e lida de volta pelo
// formulário e pela página pública — três pontos onde um deslize de
// timezone move o mês. Estes testes fixam o round-trip.
// ---------------------------------------------------------------------
describe("camposImovel — lançamento", () => {
  function dadosLancamento(
    overrides: Partial<DadosImovelFormulario> = {}
  ): DadosImovelFormulario {
    return {
      titulo: "Lançamento na planta",
      tipo: "Apartamento",
      finalidade: "SALE",
      status: "AVAILABLE",
      bairro: "Centro",
      cidade: "São Paulo",
      estado: "sp",
      lancamento: true,
      destaque: false,
      oportunidade: false,
      slideshow: false,
      caracteristicasImovel: [],
      caracteristicasCondominio: [],
      ...overrides,
    };
  }

  test("previsão de entrega: 'YYYY-MM' vira o dia 1 do mês certo, em UTC", () => {
    const campos = camposImovel(dadosLancamento({ previsaoEntrega: "2027-06" }));
    const data = campos.deliveryForecast!;
    expect(data.getUTCFullYear()).toBe(2027);
    expect(data.getUTCMonth()).toBe(5); // junho
    expect(data.getUTCDate()).toBe(1);
    expect(data.toISOString()).toBe("2027-06-01T00:00:00.000Z");
  });

  // O bug que este teste impede: com `new Date(ano, mes-1, 1)` (horário
  // local), em qualquer fuso negativo a data cai no mês ANTERIOR quando
  // lida em UTC — "Junho/2027" vira Maio/2027 no formulário e no site.
  test("nenhum mês é deslocado por timezone — os doze meses fazem round-trip", () => {
    for (let mes = 1; mes <= 12; mes++) {
      const valor = `2027-${String(mes).padStart(2, "0")}`;
      const data = camposImovel(dadosLancamento({ previsaoEntrega: valor }))
        .deliveryForecast!;
      const volta = `${data.getUTCFullYear()}-${String(
        data.getUTCMonth() + 1
      ).padStart(2, "0")}`;
      expect(volta, `mês ${valor} não sobreviveu ao round-trip`).toBe(valor);
    }
  });

  test("janeiro e dezembro não trocam de ano", () => {
    const jan = camposImovel(dadosLancamento({ previsaoEntrega: "2028-01" }))
      .deliveryForecast!;
    expect(jan.getUTCFullYear()).toBe(2028);
    expect(jan.getUTCMonth()).toBe(0);

    const dez = camposImovel(dadosLancamento({ previsaoEntrega: "2027-12" }))
      .deliveryForecast!;
    expect(dez.getUTCFullYear()).toBe(2027);
    expect(dez.getUTCMonth()).toBe(11);
  });

  test("sem previsão preenchida, grava null — nunca uma data inventada", () => {
    expect(camposImovel(dadosLancamento()).deliveryForecast).toBeNull();
    expect(
      camposImovel(dadosLancamento({ previsaoEntrega: "" })).deliveryForecast
    ).toBeNull();
  });

  test("construtora com espaços em volta é normalizada", () => {
    expect(
      camposImovel(dadosLancamento({ construtora: "  Construtora X  " })).developer
    ).toBe("Construtora X");
  });

  // Sem o trim, "   " era gravado como string truthy e virava uma linha
  // "Construtora:" vazia no cabeçalho público do imóvel.
  test("construtora só com espaços vira null, não string vazia", () => {
    expect(camposImovel(dadosLancamento({ construtora: "   " })).developer).toBeNull();
    expect(camposImovel(dadosLancamento({ construtora: "" })).developer).toBeNull();
    expect(camposImovel(dadosLancamento()).developer).toBeNull();
  });

  test("estágio da obra: 'não se aplica' grava null, valor do enum é preservado", () => {
    expect(camposImovel(dadosLancamento({ estagioObra: "" })).constructionStage).toBeNull();
    expect(
      camposImovel(dadosLancamento({ estagioObra: "UNDER_CONSTRUCTION" }))
        .constructionStage
    ).toBe("UNDER_CONSTRUCTION");
  });

  // Os campos de obra são independentes do rótulo no banco: desmarcar
  // "Lançamento" não pode apagar dado de obra já preenchido.
  test("desmarcar lançamento não zera os campos de obra", () => {
    const campos = camposImovel(
      dadosLancamento({
        lancamento: false,
        construtora: "Construtora X",
        estagioObra: "UNDER_CONSTRUCTION",
        previsaoEntrega: "2027-06",
      })
    );
    expect(campos.isLaunch).toBe(false);
    expect(campos.developer).toBe("Construtora X");
    expect(campos.constructionStage).toBe("UNDER_CONSTRUCTION");
    expect(campos.deliveryForecast).not.toBeNull();
  });
});

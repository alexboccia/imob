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

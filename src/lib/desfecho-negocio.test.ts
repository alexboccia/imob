import { describe, test, expect } from "vitest";
import {
  desfechoDoImovel,
  imovelDeveTransicionar,
  interpretarMotivoPerda,
  DESFECHO_LABEL,
  MOTIVO_PERDA_LABEL,
  MOTIVOS_PERDA,
} from "@/lib/desfecho-negocio";

describe("desfechoDoImovel", () => {
  test("venda vira vendido e locação vira alugado — sem perguntar", () => {
    expect(desfechoDoImovel("SALE")).toEqual({ tipo: "definido", status: "SOLD" });
    expect(desfechoDoImovel("RENT")).toEqual({ tipo: "definido", status: "RENTED" });
  });

  test("anunciado para os dois: o sistema NÃO escolhe", () => {
    // Um imóvel marcado como vendido quando foi alugado é pior do que um
    // imóvel sem status atualizado.
    expect(desfechoDoImovel("SALE_AND_RENT")).toEqual({ tipo: "precisa_escolha" });
  });
});

describe("imovelDeveTransicionar", () => {
  test("só um imóvel DISPONÍVEL sai de circulação", () => {
    expect(imovelDeveTransicionar("AVAILABLE")).toBe(true);
  });

  test("qualquer outro estado é preservado — o fato registrado antes vale", () => {
    for (const status of ["SOLD", "RENTED", "RESERVED", "DRAFT", "INACTIVE"] as const) {
      expect(imovelDeveTransicionar(status), status).toBe(false);
    }
  });
});

describe("interpretarMotivoPerda", () => {
  test("aceita os motivos do catálogo", () => {
    for (const motivo of MOTIVOS_PERDA) {
      expect(interpretarMotivoPerda(motivo)).toBe(motivo);
    }
  });

  test("ausência e lixo viram 'não informado', nunca um motivo falso", () => {
    for (const bruto of ["", null, undefined, "PORQUE_SIM", 42, {}]) {
      expect(interpretarMotivoPerda(bruto)).toBeNull();
    }
  });
});

describe("rótulos", () => {
  test("são texto legível, não enum cru", () => {
    expect(DESFECHO_LABEL.SOLD).toBe("Vendido");
    expect(DESFECHO_LABEL.RENTED).toBe("Alugado");
    for (const motivo of MOTIVOS_PERDA) {
      expect(MOTIVO_PERDA_LABEL[motivo]).toBeTruthy();
      expect(MOTIVO_PERDA_LABEL[motivo]).not.toBe(motivo);
    }
  });
});

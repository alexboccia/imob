import { describe, test, expect } from "vitest";
import {
  recursosDoImovel,
  urlTourSegura,
  ANCORA_PLANTAS,
  ANCORA_VIDEOS,
} from "@/lib/recursos-imovel";

// Fase 39 — a barra de recursos. O que se protege aqui é a promessa: um
// botão só existe quando o recurso existe, e um tour só vira link quando
// o endereço é seguro.

const TOUR = { type: "VIRTUAL_TOUR", url: "https://tour.exemplo.com/abc" };
const PLANTA = { type: "FLOOR_PLAN", url: "https://cdn.exemplo.com/planta.pdf" };
const VIDEO = { type: "VIDEO", url: "https://www.youtube.com/embed/xyz" };
const FOTO = { type: "PHOTO", url: "https://cdn.exemplo.com/foto.jpg" };

describe("elegibilidade de cada botão", () => {
  test("nenhum recurso: a barra não existe", () => {
    expect(recursosDoImovel([])).toEqual([]);
    // Foto NÃO é recurso da barra — a galeria já é a foto.
    expect(recursosDoImovel([FOTO])).toEqual([]);
  });

  test("só planta: só o botão de planta", () => {
    const r = recursosDoImovel([FOTO, PLANTA]);
    expect(r.map((x) => x.chave)).toEqual(["planta"]);
    expect(r[0].href).toBe(`#${ANCORA_PLANTAS}`);
    expect(r[0].externo).toBe(false);
  });

  test("só vídeo: só o botão de vídeo", () => {
    const r = recursosDoImovel([VIDEO]);
    expect(r.map((x) => x.chave)).toEqual(["video"]);
    expect(r[0].href).toBe(`#${ANCORA_VIDEOS}`);
  });

  test("só tour: só o botão de tour, e ele é externo", () => {
    const r = recursosDoImovel([TOUR]);
    expect(r.map((x) => x.chave)).toEqual(["tour"]);
    expect(r[0].href).toBe(TOUR.url);
    expect(r[0].externo).toBe(true);
  });

  test("os três: a ordem é sempre Tour, Planta, Vídeo", () => {
    // Fixa, e independente da ordem de cadastro: quem compara duas
    // fichas não deve ter de reprocurar o mesmo botão.
    const r = recursosDoImovel([VIDEO, PLANTA, TOUR]);
    expect(r.map((x) => x.rotulo)).toEqual(["Tour 360°", "Planta", "Vídeo"]);
  });

  test("planta e vídeo: o tour ausente não deixa buraco", () => {
    expect(recursosDoImovel([PLANTA, VIDEO]).map((x) => x.chave)).toEqual([
      "planta",
      "video",
    ]);
  });

  test("várias plantas e vários vídeos geram UM botão de cada", () => {
    const r = recursosDoImovel([PLANTA, PLANTA, VIDEO, VIDEO, VIDEO]);
    expect(r.map((x) => x.chave)).toEqual(["planta", "video"]);
  });

  test("vários tours: a barra leva ao primeiro, sem inventar lista", () => {
    const outro = { type: "VIRTUAL_TOUR", url: "https://tour.exemplo.com/segundo" };
    const r = recursosDoImovel([TOUR, outro]);
    expect(r).toHaveLength(1);
    expect(r[0].href).toBe(TOUR.url);
  });
});

describe("segurança da URL do tour", () => {
  test("aceita http e https", () => {
    expect(urlTourSegura("https://tour.exemplo.com/a")).toBe("https://tour.exemplo.com/a");
    expect(urlTourSegura("http://tour.exemplo.com/a")).toBe("http://tour.exemplo.com/a");
  });

  test("RECUSA esquemas perigosos — o tour vira href de um link", () => {
    for (const perigosa of [
      "javascript:alert(1)",
      "JavaScript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "vbscript:msgbox(1)",
      "file:///etc/passwd",
    ]) {
      expect(urlTourSegura(perigosa), perigosa).toBeNull();
    }
  });

  test("recusa vazio, ausente e endereço malformado", () => {
    for (const invalida of [null, undefined, "", "   ", "não é url", "/relativa"]) {
      expect(urlTourSegura(invalida as string | null)).toBeNull();
    }
  });

  test("um tour com URL insegura NÃO vira botão", () => {
    // A guarda é na leitura pública, não só na escrita: o dado pode ter
    // entrado por outro caminho.
    const r = recursosDoImovel([{ type: "VIRTUAL_TOUR", url: "javascript:alert(1)" }]);
    expect(r).toEqual([]);
  });

  test("com um tour inseguro e outro válido, o válido prevalece", () => {
    const r = recursosDoImovel([
      { type: "VIRTUAL_TOUR", url: "javascript:alert(1)" },
      TOUR,
    ]);
    expect(r).toHaveLength(1);
    expect(r[0].href).toBe(TOUR.url);
  });
});

import { describe, test, expect } from "vitest";
import { normalizarTexto } from "@/lib/texto";

// Redesenho de Características — normalizarTexto já era usado por
// SeletorCaracteristicas.tsx (busca no formulário de imóvel) sem
// cobertura de teste; adicionada agora porque a busca local do redesenho
// depende diretamente dela.
describe("normalizarTexto", () => {
  test("remove acentos", () => {
    expect(normalizarTexto("Vista panorâmica")).toBe("vista panoramica");
  });

  test("ignora caixa", () => {
    expect(normalizarTexto("PISCINA")).toBe("piscina");
  });

  test("permite comparação tolerante entre string acentuada e busca sem acento", () => {
    expect(normalizarTexto("Varanda gourmet").includes(normalizarTexto("gourmet"))).toBe(true);
    expect(normalizarTexto("Área de lazer").includes(normalizarTexto("area"))).toBe(true);
  });

  test("string sem acento permanece igual, só em minúsculas", () => {
    expect(normalizarTexto("Aceita pet")).toBe("aceita pet");
  });
});

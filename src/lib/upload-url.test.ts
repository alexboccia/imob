import { afterEach, describe, expect, test, vi } from "vitest";

// R2_IMAGE_HOST é derivado de process.env no import do módulo, então
// cada cenário precisa reimportar com o ambiente já ajustado.
async function carregar(hostR2?: string) {
  vi.resetModules();
  if (hostR2) process.env.R2_PUBLIC_URL = hostR2;
  else delete process.env.R2_PUBLIC_URL;
  return (await import("./upload-url")).urlDeUploadValida;
}

afterEach(() => {
  delete process.env.R2_PUBLIC_URL;
  vi.resetModules();
});

describe("urlDeUploadValida — com R2 configurado", () => {
  const R2 = "https://cdn.exemplo-r2.com";

  test("aceita URL do host de upload do produto", async () => {
    const valida = await carregar(R2);
    expect(valida("https://cdn.exemplo-r2.com/usuarios/foto.jpg")).toBe(true);
  });

  test("recusa host externo — o caso que a UI nunca produz, mas uma chamada direta à action produziria", async () => {
    const valida = await carregar(R2);
    expect(valida("https://evil.example.com/foto.jpg")).toBe(false);
    expect(valida("https://cdn.exemplo-r2.com.evil.com/foto.jpg")).toBe(false);
  });

  test("recusa http, javascript: e data:", async () => {
    const valida = await carregar(R2);
    expect(valida("http://cdn.exemplo-r2.com/foto.jpg")).toBe(false);
    expect(valida("javascript:alert(1)")).toBe(false);
    expect(valida("data:image/svg+xml,<svg onload=alert(1)>")).toBe(false);
  });

  test("recusa caminho relativo — todo upload devolve URL absoluta", async () => {
    const valida = await carregar(R2);
    expect(valida("/usuarios/foto.jpg")).toBe(false);
    expect(valida("nao-e-url")).toBe(false);
  });

  test("ausência de foto continua válida", async () => {
    const valida = await carregar(R2);
    expect(valida(null)).toBe(true);
    expect(valida(undefined)).toBe(true);
    expect(valida("")).toBe(true);
  });
});

describe("urlDeUploadValida — sem R2 configurado", () => {
  // Dev/teste sem storage: não há host conhecido pra comparar. Bloquear
  // tudo aqui quebraria o desenvolvimento local sem ganhar segurança em
  // produção, onde a variável existe.
  test("não bloqueia quando não há host de upload configurado", async () => {
    const valida = await carregar();
    expect(valida("https://qualquer.example.com/foto.jpg")).toBe(true);
  });
});
